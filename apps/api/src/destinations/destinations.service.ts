import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Destination, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { CreateDestinationDto, UpdateDestinationDto } from './destinations.dto';
import { SenderRegistry } from '../delivery/senders/sender.registry';
import { Conversion } from '../delivery/delivery.types';

@Injectable()
export class DestinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly registry: SenderRegistry,
  ) {}

  toPublic(destination: Destination) {
    const token = this.crypto.decrypt(destination.accessToken) ?? '';
    return {
      id: destination.id,
      type: destination.type,
      name: destination.name,
      pixelId: destination.pixelId,
      accessTokenMasked: `…${token.slice(-6)}`,
      adsAccessTokenConfigured: Boolean(destination.adsAccessToken),
      testEventCode: destination.testEventCode,
      config: destination.config,
      isActive: destination.isActive,
      createdAt: destination.createdAt,
    };
  }

  async list(workspaceId: string) {
    const destinations = await this.prisma.destination.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return destinations.map((d) => this.toPublic(d));
  }

  async create(workspaceId: string, dto: CreateDestinationDto) {
    if (dto.adsAccessToken != null && dto.type !== 'META') {
      throw new BadRequestException('Отдельный токен статистики поддерживается только для Meta.');
    }
    const destination = await this.prisma.destination.create({
      data: {
        workspaceId, ...dto,
        accessToken: this.crypto.encrypt(dto.accessToken),
        adsAccessToken: this.crypto.encrypt(dto.adsAccessToken),
      },
    });
    return this.toPublic(destination);
  }

  async getOwned(workspaceId: string, id: string): Promise<Destination> {
    const destination = await this.prisma.destination.findFirst({ where: { id, workspaceId } });
    if (!destination) {
      throw new NotFoundException('Направление не найдено');
    }
    return destination;
  }

  async update(workspaceId: string, id: string, dto: UpdateDestinationDto) {
    const current = await this.getOwned(workspaceId, id);
    if (dto.adsAccessToken != null && current.type !== 'META') {
      throw new BadRequestException('Отдельный токен статистики поддерживается только для Meta.');
    }
    const data: Prisma.DestinationUpdateInput = { ...dto };
    if (dto.accessToken !== undefined) {
      data.accessToken = this.crypto.encrypt(dto.accessToken);
    }
    if (dto.adsAccessToken !== undefined) {
      data.adsAccessToken = this.crypto.encrypt(dto.adsAccessToken);
    }
    const destination = await this.prisma.destination.update({ where: { id }, data });
    return this.toPublic(destination);
  }

  async remove(workspaceId: string, id: string) {
    await this.getOwned(workspaceId, id);
    await this.prisma.destination.delete({ where: { id } });
    return { ok: true };
  }

  /** Отправляет тестовое событие в рекламную платформу. */
  async sendTestEvent(workspaceId: string, id: string, testEventCode?: string) {
    const destination = await this.getOwned(workspaceId, id);
    const code = (testEventCode ?? destination.testEventCode)?.trim();
    if ((destination.type === 'META' || destination.type === 'TIKTOK') && !code) {
      throw new BadRequestException(
        'Укажите Test Event Code из Events Manager. Без кода проверка отправит конверсию в рабочую статистику.',
      );
    }
    const conversion: Conversion = {
      eventName: 'Lead',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: `test-${randomUUID()}`,
      email: 'test@example.com',
      phone: '+79990000000',
      externalId: 'test-contact-1',
      value: 100,
      currency: 'KZT',
      crmName: 'CAPI Test',
      // Не передаём выдуманный fbclid: он не подтверждает матчинг с реальным кликом.
      ttclid: 'test-ttclid',
      gclid: 'test-gclid',
      yclid: 'test-yclid',
    };
    try {
      // Код относится только к этому запросу; рабочее направление не меняем.
      const result = await this.registry.send({ ...destination, testEventCode: code || null }, conversion);
      if (destination.type === 'META' && result.response.events_received !== 1) {
        return { ok: false, error: 'Meta не подтвердил приём тестового события.', response: result.response };
      }
      return { ok: true, response: result.response };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
