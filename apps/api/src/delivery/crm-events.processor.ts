import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CrmConnection, EventMapping } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AmocrmService, CrmContactInfo } from '../connections/amocrm.service';
import { Bitrix24Service } from '../connections/bitrix24.service';
import {
  Conversion,
  CRM_EVENTS_QUEUE,
  CrmEventJob,
  DELIVERY_JOB_OPTS,
  DELIVERY_QUEUE,
  DeliveryJob,
} from './delivery.types';
import { buildFbc } from './pii';

/**
 * Обрабатывает входящий вебхук CRM: находит подходящие маппинги
 * (этап воронки -> событие), достаёт контактные данные из CRM
 * и ставит конверсии в очередь доставки.
 */
@Processor(CRM_EVENTS_QUEUE)
export class CrmEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmEventsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amocrm: AmocrmService,
    private readonly bitrix24: Bitrix24Service,
    @InjectQueue(DELIVERY_QUEUE) private readonly deliveryQueue: Queue<DeliveryJob>,
  ) {
    super();
  }

  async process(job: Job<CrmEventJob>): Promise<void> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: job.data.webhookEventId },
      include: { connection: true },
    });
    if (!event) {
      return;
    }
    try {
      const payload = event.payload as Record<string, any>;
      if (event.connection.type === 'AMOCRM') {
        await this.processAmocrm(event.connection, payload);
      } else {
        await this.processBitrix24(event.connection, payload);
      }
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: null },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { error: message },
      });
      throw e;
    }
  }

  // ---------- amoCRM ----------

  private async processAmocrm(connection: CrmConnection, payload: Record<string, any>) {
    // Вебхук amoCRM: leads[status][], leads[add][] — form-encoded, значения строками
    const leads = payload?.leads ?? {};
    const entries: Array<Record<string, any>> = [
      ...(Array.isArray(leads.status) ? leads.status : []),
      ...(Array.isArray(leads.add) ? leads.add : []),
    ];

    for (const entry of entries) {
      if (entry?.id == null || entry?.status_id == null) continue;
      const leadId = String(entry.id);
      const statusId = String(entry.status_id);

      // Кандидаты — по этапу; воронку фильтруем после запроса сделки:
      // pipeline_id в вебхуке amoCRM официально не гарантирован
      const candidates = await this.prisma.eventMapping.findMany({
        where: { connectionId: connection.id, entityType: 'lead', statusId, isActive: true },
      });
      if (candidates.length === 0) continue;

      let contact: CrmContactInfo = {};
      let value: number | undefined;
      let pipelineId = entry.pipeline_id != null ? String(entry.pipeline_id) : undefined;
      try {
        const lead = await this.amocrm.getLead(connection, leadId);
        value = lead.price != null ? Number(lead.price) : undefined;
        if (lead.pipeline_id != null) {
          pipelineId = String(lead.pipeline_id);
        }
        const contactId = lead._embedded?.contacts?.[0]?.id;
        if (contactId) {
          contact = await this.amocrm.getContactInfo(connection, contactId);
        }
        // Click-id/utm — из кастомных полей лида
        Object.assign(contact, this.amocrm.extractLeadClickIds(connection, lead.custom_fields_values));
      } catch (e) {
        this.logger.warn(`amoCRM: не удалось получить лид ${leadId}: ${String(e)}`);
      }

      const mappings = candidates.filter((m) => !m.pipelineId || m.pipelineId === pipelineId);
      if (mappings.length === 0) continue;

      await this.enqueueConversions(connection, mappings, leadId, statusId, contact, value);
    }
  }

  // ---------- Битрикс24 ----------

  private async processBitrix24(connection: CrmConnection, payload: Record<string, any>) {
    const eventName = String(payload?.event ?? '').toUpperCase();
    const entityId = payload?.data?.FIELDS?.ID != null ? String(payload.data.FIELDS.ID) : '';
    if (!entityId) return;

    if (eventName.startsWith('ONCRMDEAL')) {
      const deal = await this.bitrix24.getDeal(connection, entityId);
      if (!deal?.STAGE_ID) return;
      const statusId = String(deal.STAGE_ID);
      const pipelineId = deal.CATEGORY_ID != null ? String(deal.CATEGORY_ID) : undefined;

      const mappings = await this.findMappings(connection.id, 'deal', statusId, pipelineId);
      if (mappings.length === 0) return;

      let contact: CrmContactInfo = {};
      if (deal.CONTACT_ID && deal.CONTACT_ID !== '0') {
        try {
          contact = await this.bitrix24.getContactInfo(connection, String(deal.CONTACT_ID));
        } catch (e) {
          this.logger.warn(`Bitrix24: не удалось получить контакт сделки ${entityId}: ${String(e)}`);
        }
      }
      // Click-id — из полей сделки
      Object.assign(contact, this.bitrix24.extractClickIds(connection, deal));
      const value = deal.OPPORTUNITY != null ? Number(deal.OPPORTUNITY) : undefined;
      await this.enqueueConversions(connection, mappings, entityId, statusId, contact, value);
    } else if (eventName.startsWith('ONCRMLEAD')) {
      const lead = await this.bitrix24.getLead(connection, entityId);
      if (!lead?.STATUS_ID) return;
      const statusId = String(lead.STATUS_ID);

      const mappings = await this.findMappings(connection.id, 'lead', statusId, undefined);
      if (mappings.length === 0) return;

      const contact: CrmContactInfo = {
        email: lead.EMAIL?.[0]?.VALUE,
        phone: lead.PHONE?.[0]?.VALUE,
        externalId: `lead-${entityId}`,
        ...this.bitrix24.extractClickIds(connection, lead),
      };
      const value = lead.OPPORTUNITY != null ? Number(lead.OPPORTUNITY) : undefined;
      await this.enqueueConversions(connection, mappings, entityId, statusId, contact, value);
    }
  }

  // ---------- Общее ----------

  private findMappings(
    connectionId: string,
    entityType: string,
    statusId: string,
    pipelineId: string | undefined,
  ) {
    return this.prisma.eventMapping.findMany({
      where: {
        connectionId,
        entityType,
        statusId,
        isActive: true,
        OR: [{ pipelineId: null }, ...(pipelineId ? [{ pipelineId }] : [])],
      },
    });
  }

  private async enqueueConversions(
    connection: CrmConnection,
    mappings: EventMapping[],
    entityId: string,
    statusId: string,
    contact: CrmContactInfo,
    value: number | undefined,
  ) {
    for (const mapping of mappings) {
      const dedupKey = `${mapping.id}:${entityId}:${statusId}`;
      const existing = await this.prisma.deliveryLog.findUnique({ where: { dedupKey } });
      if (existing) {
        this.logger.debug(`Пропуск дубликата ${dedupKey}`);
        continue;
      }

      const eventTime = Math.floor(Date.now() / 1000);
      const hasClickId = Boolean(
        contact.fbclid || contact.fbp || contact.ttclid || contact.gclid || contact.yclid,
      );
      const conversion: Conversion = {
        eventName: mapping.eventName,
        eventTime,
        eventId: dedupKey,
        email: contact.email,
        phone: contact.phone,
        externalId: contact.externalId,
        value: mapping.sendValue ? value : undefined,
        currency: mapping.currency,
        crmName: connection.type === 'AMOCRM' ? 'amoCRM' : 'Bitrix24',
        // Click-id (fbc собираем из fbclid)
        fbc: contact.fbclid ? buildFbc(contact.fbclid, eventTime) : undefined,
        fbp: contact.fbp,
        ttclid: contact.ttclid,
        gclid: contact.gclid,
        yclid: contact.yclid,
        // Доп. поля клиента
        firstName: contact.firstName,
        lastName: contact.lastName,
        city: contact.city,
        country: contact.country,
        zip: contact.zip,
      };

      const log = await this.prisma.deliveryLog.create({
        data: {
          workspaceId: connection.workspaceId,
          mappingId: mapping.id,
          destinationId: mapping.destinationId,
          connectionId: connection.id,
          crmEntityId: entityId,
          eventName: mapping.eventName,
          // Аналитика выручки: сохраняем сумму сделки, даже если её не шлём в пиксель
          value: value ?? null,
          valueCurrency: mapping.currency,
          // Аналитика качества матчинга
          hasEmail: Boolean(contact.email),
          hasPhone: Boolean(contact.phone),
          hasExternalId: Boolean(contact.externalId),
          hasClickId,
          dedupKey,
          status: 'PENDING',
        },
      });

      await this.deliveryQueue.add(
        'send',
        { logId: log.id, destinationId: mapping.destinationId, conversion },
        DELIVERY_JOB_OPTS,
      );
    }
  }
}
