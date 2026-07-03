import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { CRM_EVENTS_QUEUE } from '../delivery/delivery.types';

@Module({
  imports: [BullModule.registerQueue({ name: CRM_EVENTS_QUEUE })],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
