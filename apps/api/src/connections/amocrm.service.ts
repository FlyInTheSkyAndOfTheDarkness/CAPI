import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmConnection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';

export interface CrmContactInfo {
  email?: string;
  phone?: string;
  externalId?: string;
}

/** Нормализованная воронка со списком этапов — общий формат для amoCRM и Битрикс24. */
export interface NormalizedPipeline {
  id: string;
  name: string;
  statuses: Array<{ id: string; name: string }>;
}

@Injectable()
export class AmocrmService {
  private readonly logger = new Logger(AmocrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  get redirectUri(): string {
    const base = this.config.get<string>('PUBLIC_API_URL', 'http://localhost:3001');
    return `${base}/api/connections/amocrm/callback`;
  }

  buildAuthorizeUrl(connection: CrmConnection): string {
    if (!connection.clientId) {
      throw new BadRequestException('У подключения не задан client_id интеграции amoCRM');
    }
    const params = new URLSearchParams({
      client_id: connection.clientId,
      state: connection.webhookSecret,
      mode: 'popup',
    });
    return `https://www.amocrm.ru/oauth?${params.toString()}`;
  }

  async exchangeCode(connection: CrmConnection, code: string, referer?: string) {
    const baseUrl = referer ? `https://${referer}` : connection.baseUrl;
    const res = await fetch(`${baseUrl}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: connection.clientId,
        client_secret: this.crypto.decrypt(connection.clientSecret),
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      hint?: string;
    };
    if (!res.ok || !data.access_token) {
      throw new BadRequestException(`amoCRM: не удалось обменять код: ${data.hint ?? res.status}`);
    }
    return this.prisma.crmConnection.update({
      where: { id: connection.id },
      data: {
        baseUrl,
        accessToken: this.crypto.encrypt(data.access_token),
        refreshToken: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Возвращает действующий access token, при необходимости обновляя его.
   * refresh_token amoCRM одноразовый и ротируется при каждом обновлении,
   * поэтому пара токенов перечитывается из БД до и после запроса —
   * параллельный воркер мог уже обновить её.
   */
  private async ensureAccessToken(connection: CrmConnection): Promise<string> {
    const fresh =
      (await this.prisma.crmConnection.findUnique({ where: { id: connection.id } })) ?? connection;
    if (!fresh.accessToken) {
      throw new BadRequestException('Подключение amoCRM не авторизовано');
    }
    const needsRefresh =
      fresh.refreshToken &&
      fresh.tokenExpiresAt &&
      fresh.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;
    if (!needsRefresh) {
      return this.crypto.decrypt(fresh.accessToken)!;
    }
    const res = await fetch(`${fresh.baseUrl}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: fresh.clientId,
        client_secret: this.crypto.decrypt(fresh.clientSecret),
        grant_type: 'refresh_token',
        refresh_token: this.crypto.decrypt(fresh.refreshToken),
        redirect_uri: this.redirectUri,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!res.ok || !data.access_token) {
      // Возможно, гонка: другой воркер успел обменять refresh_token первым
      const retry = await this.prisma.crmConnection.findUnique({ where: { id: connection.id } });
      if (
        retry?.accessToken &&
        retry.accessToken !== fresh.accessToken &&
        retry.tokenExpiresAt &&
        retry.tokenExpiresAt.getTime() > Date.now() + 60 * 1000
      ) {
        return this.crypto.decrypt(retry.accessToken)!;
      }
      this.logger.error(`Не удалось обновить токен amoCRM для ${connection.id}`);
      await this.prisma.crmConnection.update({
        where: { id: connection.id },
        data: { status: 'ERROR' },
      });
      throw new BadRequestException('amoCRM: не удалось обновить токен');
    }
    // Сохраняем новую пару сразу — до первого использования access token
    await this.prisma.crmConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: this.crypto.encrypt(data.access_token),
        // Новый refresh шифруем; если amoCRM его не прислал — оставляем текущий (уже зашифрован)
        refreshToken: data.refresh_token ? this.crypto.encrypt(data.refresh_token) : fresh.refreshToken,
        tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
        status: 'ACTIVE',
      },
    });
    return data.access_token;
  }

  private async request<T>(
    connection: CrmConnection,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const token = await this.ensureAccessToken(connection);
    const res = await fetch(`${connection.baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body != null ? JSON.stringify(init.body) : undefined,
    });
    // 204 No Content (например, пустой список вебхуков) — не пытаемся парсить тело
    if (res.status === 204) {
      return {} as T;
    }
    if (!res.ok) {
      throw new Error(`amoCRM API ${path}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async testConnection(connection: CrmConnection): Promise<void> {
    await this.request(connection, '/api/v4/account');
  }

  /** Список воронок аккаунта с их этапами (для выпадающих списков в маппингах). */
  async getPipelines(connection: CrmConnection): Promise<NormalizedPipeline[]> {
    const data = await this.request<{
      _embedded?: {
        pipelines?: Array<{
          id: number;
          name: string;
          _embedded?: { statuses?: Array<{ id: number; name: string }> };
        }>;
      };
    }>(connection, '/api/v4/leads/pipelines');
    return (data._embedded?.pipelines ?? []).map((p) => ({
      id: String(p.id),
      name: p.name,
      statuses: (p._embedded?.statuses ?? []).map((s) => ({
        id: String(s.id),
        name: s.name,
      })),
    }));
  }

  /** Адреса уже подписанных (активных) вебхуков аккаунта. */
  async listWebhookDestinations(connection: CrmConnection): Promise<string[]> {
    const data = await this.request<{
      _embedded?: { webhooks?: Array<{ destination: string; disabled?: boolean }> };
    }>(connection, '/api/v4/webhooks');
    return (data._embedded?.webhooks ?? [])
      .filter((w) => !w.disabled)
      .map((w) => w.destination);
  }

  /** Подписывает вебхук на события лидов, если он ещё не подписан. */
  async ensureWebhook(
    connection: CrmConnection,
    destination: string,
  ): Promise<{ created: boolean; destination: string }> {
    const existing = await this.listWebhookDestinations(connection);
    if (existing.includes(destination)) {
      return { created: false, destination };
    }
    await this.request(connection, '/api/v4/webhooks', {
      method: 'POST',
      body: { destination, settings: ['add_lead', 'status_lead'] },
    });
    return { created: true, destination };
  }

  async getLead(connection: CrmConnection, leadId: string) {
    return this.request<{
      id: number;
      price?: number;
      pipeline_id?: number;
      status_id?: number;
      _embedded?: { contacts?: Array<{ id: number }> };
    }>(connection, `/api/v4/leads/${leadId}?with=contacts`);
  }

  async getContactInfo(connection: CrmConnection, contactId: number): Promise<CrmContactInfo> {
    const contact = await this.request<{
      id: number;
      custom_fields_values?: Array<{
        field_code?: string;
        values?: Array<{ value?: string | number }>;
      }>;
    }>(connection, `/api/v4/contacts/${contactId}`);

    const byCode = (code: string): string | undefined => {
      const field = contact.custom_fields_values?.find((f) => f.field_code === code);
      const value = field?.values?.[0]?.value;
      return value != null ? String(value) : undefined;
    };

    return {
      email: byCode('EMAIL'),
      phone: byCode('PHONE'),
      externalId: String(contact.id),
    };
  }
}
