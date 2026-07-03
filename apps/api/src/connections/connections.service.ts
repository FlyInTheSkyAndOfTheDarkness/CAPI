import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmConnection, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { AmocrmService } from './amocrm.service';
import { Bitrix24Service } from './bitrix24.service';
import { CreateConnectionDto, UpdateConnectionDto } from './connections.dto';

export type DiagnosticStatus = 'ok' | 'warn' | 'fail';
export interface DiagnosticCheck {
  key: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly amocrm: AmocrmService,
    private readonly bitrix24: Bitrix24Service,
  ) {}

  private get publicApiUrl(): string {
    return this.config.get<string>('PUBLIC_API_URL', 'http://localhost:3001');
  }

  private webhookUrl(connection: CrmConnection): string {
    const path = connection.type === 'AMOCRM' ? 'amocrm' : 'bitrix24';
    return `${this.publicApiUrl}/api/webhooks/${path}/${connection.webhookSecret}`;
  }

  amocrmRedirectUri(): string {
    return this.amocrm.redirectUri;
  }

  /** Публичное представление — без секретов и токенов. */
  toPublic(connection: CrmConnection) {
    return {
      id: connection.id,
      type: connection.type,
      name: connection.name,
      baseUrl: connection.baseUrl,
      status: connection.status,
      hasToken: Boolean(connection.accessToken),
      webhookUrl: this.webhookUrl(connection),
      amoRedirectUri: connection.type === 'AMOCRM' ? this.amocrm.redirectUri : undefined,
      createdAt: connection.createdAt,
    };
  }

  async list(workspaceId: string) {
    const connections = await this.prisma.crmConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return connections.map((c) => this.toPublic(c));
  }

  async create(workspaceId: string, dto: CreateConnectionDto) {
    const connection = await this.prisma.crmConnection.create({
      data: {
        workspaceId,
        type: dto.type,
        name: dto.name,
        baseUrl: dto.baseUrl.replace(/\/+$/, ''),
        clientId: dto.clientId,
        clientSecret: this.crypto.encrypt(dto.clientSecret),
        appToken: this.crypto.encrypt(dto.appToken),
        accessToken: this.crypto.encrypt(dto.accessToken),
        refreshToken: this.crypto.encrypt(dto.refreshToken),
        webhookSecret: randomBytes(24).toString('hex'),
        // Для Битрикс24 REST-доступ даёт сам URL вебхука; для amoCRM нужен токен
        status: dto.type === 'BITRIX24' || dto.accessToken ? 'ACTIVE' : 'PENDING',
      },
    });
    return this.toPublic(connection);
  }

  async getOwned(workspaceId: string, id: string): Promise<CrmConnection> {
    const connection = await this.prisma.crmConnection.findFirst({ where: { id, workspaceId } });
    if (!connection) {
      throw new NotFoundException('Подключение не найдено');
    }
    return connection;
  }

  async update(workspaceId: string, id: string, dto: UpdateConnectionDto) {
    await this.getOwned(workspaceId, id);
    // Секреты шифруем; остальные поля переносим как есть
    const data: Prisma.CrmConnectionUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl.replace(/\/+$/, '');
    if (dto.clientId !== undefined) data.clientId = dto.clientId;
    if (dto.clientSecret !== undefined) data.clientSecret = this.crypto.encrypt(dto.clientSecret);
    if (dto.accessToken !== undefined) data.accessToken = this.crypto.encrypt(dto.accessToken);
    if (dto.refreshToken !== undefined) data.refreshToken = this.crypto.encrypt(dto.refreshToken);
    if (dto.appToken !== undefined) data.appToken = this.crypto.encrypt(dto.appToken);
    const connection = await this.prisma.crmConnection.update({ where: { id }, data });
    return this.toPublic(connection);
  }

  async remove(workspaceId: string, id: string) {
    await this.getOwned(workspaceId, id);
    await this.prisma.crmConnection.delete({ where: { id } });
    return { ok: true };
  }

  async test(workspaceId: string, id: string) {
    const connection = await this.getOwned(workspaceId, id);
    try {
      if (connection.type === 'AMOCRM') {
        await this.amocrm.testConnection(connection);
      } else {
        await this.bitrix24.testConnection(connection);
      }
      await this.prisma.crmConnection.update({ where: { id }, data: { status: 'ACTIVE' } });
      return { ok: true };
    } catch (e) {
      await this.prisma.crmConnection.update({ where: { id }, data: { status: 'ERROR' } });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getAmocrmAuthorizeUrl(workspaceId: string, id: string) {
    const connection = await this.getOwned(workspaceId, id);
    if (connection.type !== 'AMOCRM') {
      throw new BadRequestException('OAuth доступен только для amoCRM');
    }
    return { url: this.amocrm.buildAuthorizeUrl(connection) };
  }

  /** Callback OAuth amoCRM: state = webhookSecret подключения. */
  async handleAmocrmCallback(code: string, state: string, referer?: string) {
    const connection = await this.prisma.crmConnection.findUnique({
      where: { webhookSecret: state },
    });
    if (!connection || connection.type !== 'AMOCRM') {
      throw new NotFoundException('Подключение для OAuth-колбэка не найдено');
    }
    const updated = await this.amocrm.exchangeCode(connection, code, referer);
    // Сразу подписываемся на вебхуки — best-effort, ошибку не роняем в колбэк
    try {
      await this.amocrm.ensureWebhook(updated, this.webhookUrl(updated));
    } catch (e) {
      this.logger.warn(`Не удалось авто-подписать вебхук amoCRM ${updated.id}: ${String(e)}`);
    }
  }

  /** Списки воронок и этапов из CRM — для выпадающих списков в маппингах. */
  async getPipelines(workspaceId: string, id: string) {
    const connection = await this.getOwned(workspaceId, id);
    if (connection.type === 'AMOCRM') {
      const lead = await this.amocrm.getPipelines(connection);
      return { lead, deal: [] };
    }
    return this.bitrix24.getPipelines(connection);
  }

  /** Ручная (пере)подписка на вебхук amoCRM. */
  async ensureAmocrmWebhook(workspaceId: string, id: string) {
    const connection = await this.getOwned(workspaceId, id);
    if (connection.type !== 'AMOCRM') {
      throw new BadRequestException('Авто-подписка вебхука доступна только для amoCRM');
    }
    try {
      const result = await this.amocrm.ensureWebhook(connection, this.webhookUrl(connection));
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Пошаговая проверка «здоровья» подключения для UI-диагностики. */
  async diagnostics(workspaceId: string, id: string): Promise<DiagnosticCheck[]> {
    const connection = await this.getOwned(workspaceId, id);
    const checks: DiagnosticCheck[] = [];

    // 1. Авторизация / доступ к CRM
    let authOk = false;
    try {
      if (connection.type === 'AMOCRM') {
        await this.amocrm.testConnection(connection);
      } else {
        await this.bitrix24.testConnection(connection);
      }
      authOk = true;
      checks.push({
        key: 'auth',
        label: 'Авторизация и доступ к CRM',
        status: 'ok',
        detail: 'Токен действителен, API отвечает',
      });
    } catch (e) {
      checks.push({
        key: 'auth',
        label: 'Авторизация и доступ к CRM',
        status: 'fail',
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 2. Чтение воронок/этапов (нужно для маппинга)
    if (authOk) {
      try {
        const pipelines = await this.getPipelines(workspaceId, id);
        const count = pipelines.lead.length + pipelines.deal.length;
        checks.push({
          key: 'read',
          label: 'Чтение воронок и этапов',
          status: count > 0 ? 'ok' : 'warn',
          detail: count > 0 ? `Доступно воронок: ${count}` : 'Воронки не найдены',
        });
      } catch (e) {
        checks.push({
          key: 'read',
          label: 'Чтение воронок и этапов',
          status: 'fail',
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // 3. Подписка на вебхук
    if (connection.type === 'AMOCRM' && authOk) {
      try {
        const subscribed = await this.amocrm.listWebhookDestinations(connection);
        const ours = subscribed.includes(this.webhookUrl(connection));
        checks.push({
          key: 'webhook',
          label: 'Подписка на вебхук',
          status: ours ? 'ok' : 'warn',
          detail: ours
            ? 'Вебхук подписан на события лидов'
            : 'Вебхук не подписан — нажмите «Подписать вебхук»',
        });
      } catch (e) {
        checks.push({
          key: 'webhook',
          label: 'Подписка на вебхук',
          status: 'warn',
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (connection.type === 'BITRIX24') {
      // Исходящий вебхук Битрикс24 нельзя проверить из API — судим по приёму событий
      checks.push({
        key: 'webhook',
        label: 'Исходящий вебхук',
        status: 'warn',
        detail: 'Проверяется по факту приёма событий (см. ниже)',
      });
    }

    // 4. Приём событий
    const lastEvent = await this.prisma.webhookEvent.findFirst({
      where: { connectionId: id },
      orderBy: { createdAt: 'desc' },
    });
    checks.push({
      key: 'events',
      label: 'Входящие события из CRM',
      status: lastEvent ? 'ok' : 'warn',
      detail: lastEvent
        ? `Последнее событие: ${lastEvent.createdAt.toLocaleString('ru-RU')}`
        : 'Событий ещё не поступало',
    });

    // 5. Настроенные маппинги
    const mappingCount = await this.prisma.eventMapping.count({
      where: { connectionId: id, isActive: true },
    });
    checks.push({
      key: 'mappings',
      label: 'Активные маппинги',
      status: mappingCount > 0 ? 'ok' : 'warn',
      detail: mappingCount > 0 ? `Настроено маппингов: ${mappingCount}` : 'Нет активных маппингов',
    });

    return checks;
  }
}
