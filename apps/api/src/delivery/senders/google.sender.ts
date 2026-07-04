import { Injectable } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { Conversion } from '../delivery.types';
import { SendResult } from './meta.sender';
import { hashEmail, hashPhoneForTiktok } from '../pii';
import { CryptoService } from '../../common/crypto.service';

const GOOGLE_ADS_API_VERSION = 'v18';

interface GoogleConfig {
  developerToken?: string;
  conversionActionId?: string;
  clientId?: string;
  clientSecret?: string;
  loginCustomerId?: string;
}

/**
 * Google Ads — Enhanced Conversions for Leads через uploadClickConversions.
 * pixelId = customerId (без дефисов); accessToken = OAuth refresh_token (шифруется);
 * config = { developerToken, conversionActionId, clientId, clientSecret, loginCustomerId }.
 * Отправляет gclid + хешированные email/телефон (userIdentifiers).
 * Требует: Google Ads API developer token (одобрение Google) и OAuth-приложение.
 * Док: https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
 */
@Injectable()
export class GoogleAdsSender {
  constructor(private readonly crypto: CryptoService) {}

  private async accessToken(cfg: GoogleConfig, refreshToken: string): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId ?? '',
        client_secret: cfg.clientSecret ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = (await res.json()) as { access_token?: string; error_description?: string };
    if (!res.ok || !data.access_token) {
      throw new Error(`Google OAuth: ${data.error_description ?? res.status}`);
    }
    return data.access_token;
  }

  private conversionDateTime(eventTimeSec: number): string {
    // Формат Google Ads: 'yyyy-MM-dd HH:mm:ss+00:00' (UTC)
    const d = new Date(eventTimeSec * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
      `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
    );
  }

  async send(destination: Destination, conversion: Conversion): Promise<SendResult> {
    const cfg = (destination.config ?? {}) as GoogleConfig;
    const customerId = destination.pixelId.replace(/-/g, '');
    const refreshToken = this.crypto.decrypt(destination.accessToken) ?? '';

    if (!conversion.gclid && !conversion.email && !conversion.phone) {
      throw new Error('Google Ads: нет gclid/email/телефона для матчинга');
    }
    if (!cfg.developerToken || !cfg.conversionActionId) {
      throw new Error('Google Ads: не заданы developerToken и conversionActionId');
    }

    const userIdentifiers: Array<Record<string, string>> = [];
    if (conversion.email) userIdentifiers.push({ hashedEmail: hashEmail(conversion.email) });
    if (conversion.phone) {
      userIdentifiers.push({ hashedPhoneNumber: hashPhoneForTiktok(conversion.phone) });
    }

    const conv: Record<string, unknown> = {
      conversionAction: `customers/${customerId}/conversionActions/${cfg.conversionActionId}`,
      conversionDateTime: this.conversionDateTime(conversion.eventTime),
    };
    if (conversion.gclid) conv.gclid = conversion.gclid;
    if (userIdentifiers.length) conv.userIdentifiers = userIdentifiers;
    if (conversion.value != null) {
      conv.conversionValue = conversion.value;
      conv.currencyCode = conversion.currency;
    }

    const payload = { conversions: [conv], partialFailure: true };
    const token = await this.accessToken(cfg, refreshToken);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'developer-token': cfg.developerToken,
    };
    if (cfg.loginCustomerId) headers['login-customer-id'] = cfg.loginCustomerId.replace(/-/g, '');

    const res = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`,
      { method: 'POST', headers, body: JSON.stringify(payload) },
    );
    const response = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = response.error as { message?: string } | undefined;
      throw new Error(`Google Ads HTTP ${res.status}: ${err?.message ?? JSON.stringify(response)}`);
    }
    // partialFailureError присутствует, если конверсия отклонена валидатором
    if (response.partialFailureError) {
      throw new Error(
        `Google Ads: ${(response.partialFailureError as { message?: string }).message ?? 'partial failure'}`,
      );
    }
    return { payload, response };
  }
}
