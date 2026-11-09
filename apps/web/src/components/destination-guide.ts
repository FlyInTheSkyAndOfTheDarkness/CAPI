import type { DestinationKind } from '../lib/types';

/** Дополнительное поле настроек платформы (кладётся в `config`). */
export interface ConfigField {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
}

/** Подписи и подсказки «где взять реквизиты» для платформы. */
export interface Guide {
  title: string;
  desc: string;
  pixelLabel: string;
  pixelHint: string;
  tokenLabel: string;
  tokenHint: string;
  hasTestCode?: boolean;
  configFields?: ConfigField[];
}

export const DESTINATION_KINDS: DestinationKind[] = ['META', 'TIKTOK', 'GOOGLE_ADS', 'YANDEX'];

export const GUIDE: Record<DestinationKind, Guide> = {
  META: {
    title: 'Meta (Facebook / Instagram)',
    desc: 'Conversions API — серверные события в Meta Ads',
    pixelLabel: 'Pixel ID',
    pixelHint: 'Events Manager → Источники данных → ваш пиксель (ID под названием).',
    tokenLabel: 'Access Token',
    tokenHint: 'Events Manager → Настройки → Conversions API → Сгенерировать токен доступа.',
    hasTestCode: true,
    configFields: [
      {
        key: 'adAccountId',
        label: 'ID рекламного кабинета (для отчёта по кампаниям, необязательно)',
        hint:
          'Ads Manager → ID кабинета вверху слева (число из act_…). Для отчётов нужен токен с правом ads_read и доступом к кабинету. Отдельный токен можно добавить в настройках направления.',
      },
    ],
  },
  TIKTOK: {
    title: 'TikTok',
    desc: 'Events API — серверные события в TikTok Ads',
    pixelLabel: 'Event Source ID (CRM Event Set ID)',
    pixelHint: 'Events Manager → создайте источник данных «CRM» → его CRM Event Set ID.',
    tokenLabel: 'Access Token',
    tokenHint: 'TikTok Events Manager → сгенерируйте Access Token для источника.',
    hasTestCode: true,
  },
  GOOGLE_ADS: {
    title: 'Google Ads',
    desc: 'Enhanced Conversions for Leads — офлайн-конверсии по gclid',
    pixelLabel: 'Customer ID (без дефисов)',
    pixelHint: 'Google Ads → ID аккаунта вверху справа (10 цифр).',
    tokenLabel: 'OAuth refresh token',
    tokenHint: 'Получается через OAuth-приложение Google (offline access).',
    configFields: [
      { key: 'developerToken', label: 'Developer token', hint: 'Google Ads API Center (нужно одобрение Google)', required: true },
      { key: 'conversionActionId', label: 'Conversion Action ID', hint: 'ID действия-конверсии в Google Ads', required: true },
      { key: 'clientId', label: 'OAuth Client ID', required: true },
      { key: 'clientSecret', label: 'OAuth Client Secret', required: true },
      { key: 'loginCustomerId', label: 'Login Customer ID (MCC, необязательно)' },
    ],
  },
  YANDEX: {
    title: 'Яндекс.Метрика',
    desc: 'Офлайн-конверсии по yclid → цель Метрики',
    pixelLabel: 'Номер счётчика Метрики',
    pixelHint: 'Яндекс.Метрика → настройки счётчика → номер счётчика.',
    tokenLabel: 'OAuth-токен',
    tokenHint: 'oauth.yandex.ru → токен с доступом к API Метрики.',
    configFields: [
      { key: 'goal', label: 'Идентификатор цели (target)', hint: 'Имя офлайн-цели в Метрике', required: true },
    ],
  },
};
