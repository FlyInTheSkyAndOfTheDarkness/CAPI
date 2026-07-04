import { Injectable } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { Conversion } from '../delivery.types';
import { hashEmail, hashPhoneForTiktok, sha256 } from '../pii';
import { SendResult } from './meta.sender';
import { CryptoService } from '../../common/crypto.service';

const EVENTS_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

@Injectable()
export class TiktokSender {
  constructor(private readonly crypto: CryptoService) {}

  async send(destination: Destination, conversion: Conversion): Promise<SendResult> {
    const config = (destination.config ?? {}) as { eventSource?: string };
    const accessToken = this.crypto.decrypt(destination.accessToken) ?? '';

    const user: Record<string, string> = {};
    if (conversion.email) user.email = hashEmail(conversion.email);
    if (conversion.phone) user.phone = hashPhoneForTiktok(conversion.phone);
    if (conversion.externalId) user.external_id = sha256(conversion.externalId);
    // TikTok click id — НЕ хешируется, сильно улучшает матчинг
    if (conversion.ttclid) user.ttclid = conversion.ttclid;
    if (Object.keys(user).length === 0) {
      throw new Error('TikTok Events API: нет данных о клиенте (email/телефон/ID/ttclid) для матчинга');
    }

    const event: Record<string, unknown> = {
      event: conversion.eventName,
      event_time: conversion.eventTime,
      event_id: conversion.eventId,
      user,
    };
    if (conversion.value != null) {
      event.properties = { value: conversion.value, currency: conversion.currency };
    }

    const payload: Record<string, unknown> = {
      event_source: config.eventSource ?? 'crm',
      event_source_id: destination.pixelId,
      data: [event],
    };
    if (destination.testEventCode) {
      payload.test_event_code = destination.testEventCode;
    }

    const res = await fetch(EVENTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
    });
    const response = (await res.json()) as { code?: number; message?: string };
    if (!res.ok || (response.code != null && response.code !== 0)) {
      throw new Error(`TikTok Events API: code=${response.code} ${response.message ?? ''}`.trim());
    }
    return { payload, response: response as Record<string, unknown> };
  }
}
