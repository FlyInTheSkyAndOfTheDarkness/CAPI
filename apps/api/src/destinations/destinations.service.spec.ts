import { BadRequestException } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { DestinationsService } from './destinations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { SenderRegistry } from '../delivery/senders/sender.registry';

describe('Проверка рекламного направления', () => {
  const destination = {
    id: 'destination', workspaceId: 'workspace', type: 'META', testEventCode: null,
  } as Destination;

  function setup(overrides: Partial<Destination> = {}) {
    const stored = { ...destination, ...overrides };
    const prisma = { destination: { findFirst: jest.fn().mockResolvedValue(stored) } };
    const registry = { send: jest.fn().mockResolvedValue({ response: { events_received: 1 } }) };
    const service = new DestinationsService(
      prisma as unknown as PrismaService,
      {} as CryptoService,
      registry as unknown as SenderRegistry,
    );
    return { service, registry, stored };
  }

  it.each(['META', 'TIKTOK'] as const)('не отправляет %s без кода тестирования', async (type) => {
    const { service, registry } = setup({ type });
    await expect(service.sendTestEvent('workspace', 'destination')).rejects.toThrow(BadRequestException);
    await expect(service.sendTestEvent('workspace', 'destination', '  ')).rejects.toThrow(BadRequestException);
    expect(registry.send).not.toHaveBeenCalled();
  });

  it('передаёт разовый код отправителю, не меняя настройки рабочих событий', async () => {
    const { service, registry, stored } = setup();
    await expect(service.sendTestEvent('workspace', 'destination', ' TEST123 ')).resolves.toMatchObject({ ok: true });
    expect(registry.send).toHaveBeenCalledWith(
      expect.objectContaining({ testEventCode: 'TEST123' }),
      expect.objectContaining({ eventName: 'Lead', email: 'test@example.com' }),
    );
    expect(stored.testEventCode).toBeNull();
    expect(registry.send.mock.calls[0][1].fbc).toBeUndefined();
  });

  it('поддерживает сохранённый код старого клиента', async () => {
    const { service, registry } = setup({ testEventCode: 'TEST_SAVED' });
    await service.sendTestEvent('workspace', 'destination');
    expect(registry.send.mock.calls[0][0].testEventCode).toBe('TEST_SAVED');
  });

  it('явный пустой код не подменяет сохранённым кодом', async () => {
    const { service, registry } = setup({ testEventCode: 'TEST_SAVED' });
    await expect(service.sendTestEvent('workspace', 'destination', '')).rejects.toThrow(BadRequestException);
    expect(registry.send).not.toHaveBeenCalled();
  });

  it('не сообщает об успехе, если Meta не принял ни одного события', async () => {
    const { service, registry } = setup();
    registry.send.mockResolvedValue({ response: { events_received: 0 } });
    await expect(service.sendTestEvent('workspace', 'destination', 'TEST123')).resolves.toMatchObject({ ok: false });
  });

  it('показывает отказ платформы как ошибку проверки', async () => {
    const { service, registry } = setup();
    registry.send.mockRejectedValue(new Error('Токен истёк'));
    await expect(service.sendTestEvent('workspace', 'destination', 'TEST123')).resolves.toMatchObject({ ok: false, error: 'Токен истёк' });
  });
});
