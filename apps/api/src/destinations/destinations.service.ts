import { Injectable, NotFoundException } from '@nestjs/common';
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
    const destination = await this.prisma.destination.create({
      data: { workspaceId, ...dto, accessToken: this.crypto.encrypt(dto.accessToken) },
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
    await this.getOwned(workspaceId, id);
    const data: Prisma.DestinationUpdateInput = { ...dto };
    if (dto.accessToken !== undefined) {
      data.accessToken = this.crypto.encrypt(dto.accessToken);
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
  async sendTestEvent(workspaceId: string, id: string) {
    const destination = await this.getOwned(workspaceId, id);
    const conversion: Conversion = {
      eventName: 'Lead',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: `test-${Date.now()}`,
      email: 'test@example.com',
      phone: '+79990000000',
      externalId: 'test-contact-1',
      value: 100,
      currency: 'KZT',
      crmName: 'CAPI Test',
      // Тестовые click-id — чтобы проверить path матчинга по кликам
      fbc: 'fb.1.1700000000000.testfbclid',
      ttclid: 'test-ttclid',
      gclid: 'test-gclid',
      yclid: 'test-yclid',
    };
    try {
      const result = await this.registry.send(destination, conversion);
      return { ok: true, response: result.response };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
