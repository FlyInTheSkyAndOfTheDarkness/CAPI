import { Injectable } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { Conversion } from '../delivery.types';
import { SendResult } from './meta.sender';
import { CryptoService } from '../../common/crypto.service';

/**
 * Яндекс.Метрика — загрузка офлайн-конверсий по yclid.
 * pixelId = номер счётчика Метрики; accessToken = OAuth-токен;
 * config.goal = идентификатор цели (target). Матчинг офлайн-конверсий в Метрике
 * идёт по yclid (или ClientId/UserId) — email/телефон здесь не используются.
 * Док: https://yandex.ru/dev/metrika/ru/management/openapi/import/offline_conversions
 */
@Injectable()
export class YandexSender {
  constructor(private readonly crypto: CryptoService) {}

  async send(destination: Destination, conversion: Conversion): Promise<SendResult> {
    const token = this.crypto.decrypt(destination.accessToken) ?? '';
    const config = (destination.config ?? {}) as { goal?: string };
    const counterId = destination.pixelId;
    const goal = config.goal || conversion.eventName;

    if (!conversion.yclid) {
      throw new Error('Яндекс.Метрика: нет yclid — офлайн-конверсия не сматчится');
    }

    const cols = ['Yclid', 'Target', 'DateTime'];
    const row = [conversion.yclid, goal, String(conversion.eventTime)];
    if (conversion.value != null) {
      cols.push('Price', 'Currency');
      row.push(String(conversion.value), conversion.currency);
    }
    const csv = `${cols.join(',')}\n${row.join(',')}`;

    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'conversions.csv');

    const url =
      `https://api-metrika.yandex.net/management/v1/counter/${counterId}` +
      `/offline_conversions/upload?client_id_type=YCLID`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}` },
      body: form,
    });
    const response = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (response.message as string) ?? JSON.stringify(response);
      throw new Error(`Яндекс.Метрика HTTP ${res.status}: ${msg}`);
    }
    return { payload: { counterId, goal, csv }, response };
  }
}
