/** Нормализованная конверсия — единый формат перед отправкой в любую платформу. */
export interface Conversion {
  eventName: string;
  /** Unix time в секундах */
  eventTime: number;
  /** Ключ дедупликации: mappingId:entityId:statusId */
  eventId: string;
  email?: string;
  phone?: string;
  /** ID контакта в CRM */
  externalId?: string;
  value?: number;
  currency: string;
  /** Название CRM-источника — Meta требует lead_event_source для CRM-событий */
  crmName?: string;
}

export interface CrmEventJob {
  webhookEventId: string;
}

export interface DeliveryJob {
  logId: string;
  destinationId: string;
  conversion: Conversion;
}

export const CRM_EVENTS_QUEUE = 'crm-events';
export const DELIVERY_QUEUE = 'delivery';

export const DELIVERY_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
