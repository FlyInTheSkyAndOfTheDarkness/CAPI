import { Injectable } from '@nestjs/common';
import { Destination, DestinationType } from '@prisma/client';
import { Conversion } from '../delivery.types';
import { MetaSender, SendResult } from './meta.sender';
import { TiktokSender } from './tiktok.sender';
import { GoogleAdsSender } from './google.sender';
import { YandexSender } from './yandex.sender';

export interface ConversionSender {
  send(destination: Destination, conversion: Conversion): Promise<SendResult>;
}

/** Единая точка выбора отправителя по типу направления. */
@Injectable()
export class SenderRegistry {
  private readonly senders: Record<DestinationType, ConversionSender>;

  constructor(
    meta: MetaSender,
    tiktok: TiktokSender,
    google: GoogleAdsSender,
    yandex: YandexSender,
  ) {
    this.senders = {
      META: meta,
      TIKTOK: tiktok,
      GOOGLE_ADS: google,
      YANDEX: yandex,
    };
  }

  get(type: DestinationType): ConversionSender {
    const sender = this.senders[type];
    if (!sender) {
      throw new Error(`Нет отправителя для типа направления ${type}`);
    }
    return sender;
  }

  send(destination: Destination, conversion: Conversion): Promise<SendResult> {
    return this.get(destination.type).send(destination, conversion);
  }
}
