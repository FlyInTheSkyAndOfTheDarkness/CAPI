import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSender } from './senders/meta.sender';
import { TiktokSender } from './senders/tiktok.sender';
import { DELIVERY_QUEUE, DeliveryJob } from './delivery.types';

/** Отправляет конверсию в рекламную платформу с ретраями (BullMQ backoff). */
@Processor(DELIVERY_QUEUE)
export class DeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSender: MetaSender,
    private readonly tiktokSender: TiktokSender,
  ) {
    super();
  }

  async process(job: Job<DeliveryJob>): Promise<void> {
    const { logId, destinationId, conversion } = job.data;

    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination || !destination.isActive) {
      await this.prisma.deliveryLog.update({
        where: { id: logId },
        data: { status: 'SKIPPED', error: 'Направление отключено или удалено' },
      });
      return;
    }

    const attempts = job.attemptsMade + 1;
    try {
      const result =
        destination.type === 'META'
          ? await this.metaSender.send(destination, conversion)
          : await this.tiktokSender.send(destination, conversion);

      await this.prisma.deliveryLog.update({
        where: { id: logId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts,
          requestPayload: result.payload as Prisma.InputJsonValue,
          response: result.response as Prisma.InputJsonValue,
          error: null,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isFinalAttempt = attempts >= (job.opts.attempts ?? 1);
      this.logger.warn(`Доставка ${logId} (попытка ${attempts}) не удалась: ${message}`);
      await this.prisma.deliveryLog.update({
        where: { id: logId },
        data: { status: isFinalAttempt ? 'FAILED' : 'PENDING', attempts, error: message },
      });
      throw e;
    }
  }
}
