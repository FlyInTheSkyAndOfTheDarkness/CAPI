import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { LogsService } from '../logs/logs.service';

export interface UpdateAlertsDto {
  enabled?: boolean;
  telegramChatId?: string;
  telegramBotToken?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Push-алерты о проблемах с таргетом. Раз в 15 минут по каждому воркспейсу с
 * включёнными алертами запускается Советник; критичные/важные проблемы шлются в
 * Telegram. Дедуп по подписи набора проблем — чтобы не спамить одинаковым.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly logsService: LogsService,
  ) {}

  async getSettings(workspaceId: string) {
    const s = await this.prisma.alertSettings.findUnique({ where: { workspaceId } });
    return {
      enabled: s?.enabled ?? false,
      telegramChatId: s?.telegramChatId ?? '',
      hasToken: Boolean(s?.telegramBotToken),
      lastSentAt: s?.lastSentAt ?? null,
    };
  }

  async updateSettings(workspaceId: string, dto: UpdateAlertsDto) {
    const data: Record<string, unknown> = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.telegramChatId !== undefined) data.telegramChatId = dto.telegramChatId || null;
    if (dto.telegramBotToken !== undefined) {
      data.telegramBotToken = dto.telegramBotToken ? this.crypto.encrypt(dto.telegramBotToken) : null;
    }
    await this.prisma.alertSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data,
    });
    return this.getSettings(workspaceId);
  }

  async testAlert(workspaceId: string) {
    const s = await this.prisma.alertSettings.findUnique({ where: { workspaceId } });
    if (!s?.telegramBotToken || !s.telegramChatId) {
      return { ok: false, error: 'Не заданы Telegram-токен и/или chat id' };
    }
    try {
      await this.sendTelegram(
        this.crypto.decrypt(s.telegramBotToken)!,
        s.telegramChatId,
        '✅ <b>CAPI</b>: тестовое уведомление. Алерты подключены — будем присылать проблемы с таргетом.',
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async sendTelegram(token: string, chatId: string, text: string) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      throw new Error(`Telegram: ${data.description ?? res.status}`);
    }
  }

  @Cron('*/15 * * * *')
  async checkAll() {
    const list = await this.prisma.alertSettings.findMany({
      where: { enabled: true, telegramChatId: { not: null } },
    });
    for (const s of list) {
      if (!s.telegramBotToken) continue;
      try {
        await this.checkWorkspace(s);
      } catch (e) {
        this.logger.warn(`Алерт для ${s.workspaceId} не отправлен: ${String(e)}`);
      }
    }
  }

  private async checkWorkspace(s: AlertSettings) {
    const advisor = await this.logsService.advisor(s.workspaceId);
    const problems = advisor.recommendations.filter(
      (r) => r.severity === 'critical' || r.severity === 'high',
    );
    const signature = problems.map((p) => p.title).sort().join('|');

    // Проблем нет — сбрасываем подпись, чтобы новая проблема снова уведомила
    if (!signature) {
      if (s.lastSignature) {
        await this.prisma.alertSettings.update({ where: { id: s.id }, data: { lastSignature: null } });
      }
      return;
    }
    // Тот же набор проблем — уже уведомляли
    if (signature === s.lastSignature) return;

    const body = problems
      .map(
        (p) =>
          `• <b>${escapeHtml(p.title)}</b>${p.metric ? ` — ${escapeHtml(p.metric)}` : ''}\n${escapeHtml(p.detail)}`,
      )
      .join('\n\n');
    const text = `⚠️ <b>CAPI — проблемы с таргетом</b> (оценка ${advisor.score}/100)\n\n${body}`;

    await this.sendTelegram(this.crypto.decrypt(s.telegramBotToken!)!, s.telegramChatId!, text);
    await this.prisma.alertSettings.update({
      where: { id: s.id },
      data: { lastSignature: signature, lastSentAt: new Date() },
    });
  }
}
