import { Injectable } from '@nestjs/common';
import { CrmConnection } from '@prisma/client';
import { CrmContactInfo, NormalizedPipeline } from './amocrm.service';

/**
 * Работает через входящий вебхук Битрикс24 (baseUrl вида
 * https://portal.bitrix24.ru/rest/1/xxxxxxxx). Этого достаточно для REST-вызовов
 * без публикации приложения в маркетплейсе.
 */
@Injectable()
export class Bitrix24Service {
  async call<T>(connection: CrmConnection, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const base = connection.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/${method}.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as { result?: T; error?: string; error_description?: string };
    if (data.error) {
      throw new Error(`Bitrix24 ${method}: ${data.error} ${data.error_description ?? ''}`.trim());
    }
    return data.result as T;
  }

  async testConnection(connection: CrmConnection): Promise<void> {
    await this.call(connection, 'profile');
  }

  /**
   * Воронки со стадиями. Для сделок — направления (crm.category.list) с их
   * стадиями; для лидов — псевдо-воронка со статусами лида. Стадии берём одним
   * вызовом crm.status.list и группируем по ENTITY_ID (STATUS — лиды,
   * DEAL_STAGE[_N] — сделки), STATUS_ID совпадает со STAGE_ID из вебхука.
   */
  async getPipelines(
    connection: CrmConnection,
  ): Promise<{ lead: NormalizedPipeline[]; deal: NormalizedPipeline[] }> {
    const [statuses, categoryResult] = await Promise.all([
      this.call<Array<{ ENTITY_ID: string; STATUS_ID: string; NAME: string }>>(
        connection,
        'crm.status.list',
      ),
      this.call<{ categories?: Array<{ id: number; name: string }> }>(connection, 'crm.category.list', {
        entityTypeId: 2,
      }),
    ]);

    const stagesFor = (entityId: string) =>
      (statuses ?? [])
        .filter((s) => s.ENTITY_ID === entityId)
        .map((s) => ({ id: s.STATUS_ID, name: s.NAME }));

    const leadStatuses = stagesFor('STATUS');
    const categories = categoryResult?.categories ?? [];
    const deal: NormalizedPipeline[] = categories.map((c) => ({
      id: String(c.id),
      name: c.name,
      statuses: stagesFor(String(c.id) === '0' ? 'DEAL_STAGE' : `DEAL_STAGE_${c.id}`),
    }));

    return {
      lead: leadStatuses.length ? [{ id: '', name: 'Лиды', statuses: leadStatuses }] : [],
      deal,
    };
  }

  async getDeal(connection: CrmConnection, dealId: string) {
    return this.call<{
      ID: string;
      STAGE_ID?: string;
      CATEGORY_ID?: string;
      OPPORTUNITY?: string;
      CURRENCY_ID?: string;
      CONTACT_ID?: string;
    }>(connection, 'crm.deal.get', { id: dealId });
  }

  async getLead(connection: CrmConnection, leadId: string) {
    return this.call<{
      ID: string;
      STATUS_ID?: string;
      OPPORTUNITY?: string;
      CURRENCY_ID?: string;
      EMAIL?: Array<{ VALUE?: string }>;
      PHONE?: Array<{ VALUE?: string }>;
    }>(connection, 'crm.lead.get', { id: leadId });
  }

  async getContactInfo(connection: CrmConnection, contactId: string): Promise<CrmContactInfo> {
    const contact = await this.call<{
      ID: string;
      EMAIL?: Array<{ VALUE?: string }>;
      PHONE?: Array<{ VALUE?: string }>;
    }>(connection, 'crm.contact.get', { id: contactId });
    return {
      email: contact.EMAIL?.[0]?.VALUE,
      phone: contact.PHONE?.[0]?.VALUE,
      externalId: String(contact.ID),
    };
  }
}
