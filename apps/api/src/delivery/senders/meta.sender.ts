import { Injectable } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { Conversion } from '../delivery.types';
import {
  hashCountry,
  hashEmail,
  hashPerson,
  hashPhoneForMeta,
  hashZip,
  sha256,
} from '../pii';
import { CryptoService } from '../../common/crypto.service';

// Marketing API живёт ~год на версию — держим в конфиге и обновляем.
// v25.0 актуальна на июль 2026 (v21–v23 уже истекли).
const DEFAULT_GRAPH_API_VERSION = 'v25.0';

export interface SendResult {
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
}

@Injectable()
export class MetaSender {
  constructor(private readonly crypto: CryptoService) {}

  async send(destination: Destination, conversion: Conversion): Promise<SendResult> {
    const config = (destination.config ?? {}) as { actionSource?: string; apiVersion?: string };
    const accessToken = this.crypto.decrypt(destination.accessToken) ?? '';
    const apiVersion =
      config.apiVersion ?? process.env.META_GRAPH_API_VERSION ?? DEFAULT_GRAPH_API_VERSION;

    const userData: Record<string, string | string[]> = {};
    if (conversion.email) userData.em = [hashEmail(conversion.email)];
    if (conversion.phone) userData.ph = [hashPhoneForMeta(conversion.phone)];
    if (conversion.externalId) userData.external_id = [sha256(conversion.externalId)];
    // Click-id — сильнейший сигнал матчинга, передаётся НЕ хешированным
    if (conversion.fbc) userData.fbc = conversion.fbc;
    if (conversion.fbp) userData.fbp = conversion.fbp;
    // Доп. поля клиента (хешированные)
    const fn = conversion.firstName && hashPerson(conversion.firstName);
    const ln = conversion.lastName && hashPerson(conversion.lastName);
    const ct = conversion.city && hashPerson(conversion.city);
    const co = conversion.country && hashCountry(conversion.country);
    const zp = conversion.zip && hashZip(conversion.zip);
    if (fn) userData.fn = [fn];
    if (ln) userData.ln = [ln];
    if (ct) userData.ct = [ct];
    if (co) userData.country = [co];
    if (zp) userData.zp = [zp];

    // Матчинг возможен, если есть хотя бы один идентификатор (в т.ч. click-id)
    const hasIdentifier =
      conversion.email || conversion.phone || conversion.externalId || conversion.fbc || conversion.fbp;
    if (!hasIdentifier) {
      throw new Error('Meta CAPI: нет данных о клиенте (email/телефон/ID/click-id) для матчинга');
    }

    // Спецификация Conversion Leads: event_source="crm" + lead_event_source
    const customData: Record<string, unknown> = {
      event_source: 'crm',
      lead_event_source: conversion.crmName ?? 'CRM',
    };
    if (conversion.value != null) {
      customData.value = conversion.value;
      customData.currency = conversion.currency;
    }

    const event: Record<string, unknown> = {
      event_name: conversion.eventName,
      event_time: conversion.eventTime,
      event_id: conversion.eventId,
      action_source: config.actionSource ?? 'system_generated',
      user_data: userData,
      custom_data: customData,
    };

    const payload: Record<string, unknown> = { data: [event] };
    if (destination.testEventCode) {
      payload.test_event_code = destination.testEventCode;
    }

    // access_token — канонично query-параметром, не в теле
    const url =
      `https://graph.facebook.com/${apiVersion}/${destination.pixelId}/events` +
      `?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const response = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const error = response.error as { message?: string } | undefined;
      throw new Error(`Meta CAPI HTTP ${res.status}: ${error?.message ?? JSON.stringify(response)}`);
    }
    return { payload, response };
  }
}
