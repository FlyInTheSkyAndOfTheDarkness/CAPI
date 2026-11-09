import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Destination } from '@prisma/client';
import { CryptoService } from '../common/crypto.service';
import { SenderRegistry } from '../delivery/senders/sender.registry';
import { PrismaService } from '../prisma/prisma.service';
import { DestinationsService } from './destinations.service';

describe('Хранение токена статистики', () => {
  const crypto = new CryptoService(new ConfigService({ ENCRYPTION_KEY: 'test-key' }));
  function setup(type = 'META') {
    const stored = {
      id: 'destination', workspaceId: 'workspace', type,
      accessToken: crypto.encrypt('working-capi-token'),
      adsAccessToken: crypto.encrypt('old-ads-token'),
    } as Destination;
    const prisma = { destination: {
      findFirst: jest.fn().mockResolvedValue(stored),
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...stored, ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...stored, ...data })),
    } };
    const service = new DestinationsService(prisma as unknown as PrismaService, crypto, {} as SenderRegistry);
    return { service, prisma, stored };
  }

  it('шифрует отдельный токен при создании и не раскрывает его клиенту', async () => {
    const { service, prisma } = setup();
    const result = await service.create('workspace', {
      type: 'META', name: 'Meta', pixelId: '123', accessToken: 'capi-secret', adsAccessToken: 'ads-secret',
    });
    const data = prisma.destination.create.mock.calls[0][0].data;
    expect(data.adsAccessToken).toMatch(/^enc:v1:/);
    expect(crypto.decrypt(data.adsAccessToken)).toBe('ads-secret');
    expect(result.adsAccessTokenConfigured).toBe(true);
    expect(JSON.stringify(result)).not.toContain('ads-secret');
    expect(result).not.toHaveProperty('adsAccessToken');
  });

  it('заменяет токен отчётов, сохраняя основной токен', async () => {
    const { service, prisma, stored } = setup();
    const result = await service.update('workspace', 'destination', { adsAccessToken: 'new-ads-token' });
    const data = prisma.destination.update.mock.calls[0][0].data;
    expect(crypto.decrypt(data.adsAccessToken)).toBe('new-ads-token');
    expect(data).not.toHaveProperty('accessToken');
    expect(result.accessTokenMasked).toBe(service.toPublic(stored).accessTokenMasked);
  });

  it('сохраняет отдельный токен, когда поле отсутствует в PATCH', async () => {
    const { service, prisma } = setup();
    await service.update('workspace', 'destination', { name: 'New name' });
    expect(prisma.destination.update.mock.calls[0][0].data).not.toHaveProperty('adsAccessToken');
  });

  it('удаляет отдельный токен только по явному null', async () => {
    const { service, prisma } = setup();
    const result = await service.update('workspace', 'destination', { adsAccessToken: null });
    expect(prisma.destination.update.mock.calls[0][0].data.adsAccessToken).toBeNull();
    expect(result.adsAccessTokenConfigured).toBe(false);
  });

  it('не меняет направление другого воркспейса', async () => {
    const { service, prisma } = setup();
    prisma.destination.findFirst.mockResolvedValue(null);
    await expect(service.update('other-workspace', 'destination', { adsAccessToken: 'secret' }))
      .rejects.toThrow(NotFoundException);
    expect(prisma.destination.findFirst).toHaveBeenCalledWith({ where: { id: 'destination', workspaceId: 'other-workspace' } });
    expect(prisma.destination.update).not.toHaveBeenCalled();
  });

  it('не принимает токен отчётов для других платформ', async () => {
    const { service, prisma } = setup('TIKTOK');
    await expect(service.update('workspace', 'destination', { adsAccessToken: 'secret' }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.destination.update).not.toHaveBeenCalled();
  });
});
