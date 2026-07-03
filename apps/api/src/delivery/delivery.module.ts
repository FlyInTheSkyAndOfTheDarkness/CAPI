import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConnectionsModule } from '../connections/connections.module';
import { CrmEventsProcessor } from './crm-events.processor';
import { DeliveryProcessor } from './delivery.processor';
import { MetaSender } from './senders/meta.sender';
import { TiktokSender } from './senders/tiktok.sender';
import { CRM_EVENTS_QUEUE, DELIVERY_QUEUE } from './delivery.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_EVENTS_QUEUE }, { name: DELIVERY_QUEUE }),
    ConnectionsModule,
  ],
  providers: [CrmEventsProcessor, DeliveryProcessor, MetaSender, TiktokSender],
  exports: [MetaSender, TiktokSender],
})
export class DeliveryModule {}
