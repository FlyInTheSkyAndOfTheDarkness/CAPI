import { Body, Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CrmType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CRM_EVENTS_QUEUE, CrmEventJob } from '../delivery/delivery.types';

/**
 * Публичные эндпоинты для вебхуков CRM. Аутентификация — секретом в URL.
 * Отвечаем 200 сразу, обработка идёт в очереди.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CRM_EVENTS_QUEUE) private readonly queue: Queue<CrmEventJob>,
  ) {}

  @Post('amocrm/:secret')
  @HttpCode(200)
  amocrm(@Param('secret') secret: string, @Body() body: unknown) {
    return this.handle('AMOCRM', secret, body);
  }

  @Post('bitrix24/:secret')
  @HttpCode(200)
  bitrix24(@Param('secret') secret: string, @Body() body: unknown) {
    return this.handle('BITRIX24', secret, body);
  }

  private async handle(type: CrmType, secret: string, body: unknown) {
    const connection = await this.prisma.crmConnection.findUnique({
      where: { webhookSecret: secret },
    });
    if (!connection || connection.type !== type) {
      throw new NotFoundException();
    }
    // Битрикс24: если задан application_token, сверяем его с auth[application_token] события
    if (connection.type === 'BITRIX24' && connection.appToken) {
      const incoming = (body as { auth?: { application_token?: string } })?.auth
        ?.application_token;
      if (incoming !== connection.appToken) {
        throw new NotFoundException();
      }
    }
    const event = await this.prisma.webhookEvent.create({
      data: {
        connectionId: connection.id,
        payload: (body ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.queue.add(
      'process',
      { webhookEventId: event.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    return { ok: true };
  }
}
