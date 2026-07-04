import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConnectionsModule } from '../connections/connections.module';
import { CrmEventsProcessor } from './crm-events.processor';
import { DeliveryProcessor } from './delivery.processor';
import { MetaSender } from './senders/meta.sender';
import { TiktokSender } from './senders/tiktok.sender';
import { GoogleAdsSender } from './senders/google.sender';
import { YandexSender } from './senders/yandex.sender';
import { SenderRegistry } from './senders/sender.registry';
import { CRM_EVENTS_QUEUE, DELIVERY_QUEUE } from './delivery.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_EVENTS_QUEUE }, { name: DELIVERY_QUEUE }),
    ConnectionsModule,
  ],
  providers: [
    CrmEventsProcessor,
    DeliveryProcessor,
    MetaSender,
    TiktokSender,
    GoogleAdsSender,
    YandexSender,
    SenderRegistry,
  ],
  exports: [SenderRegistry],
})
export class DeliveryModule {}
