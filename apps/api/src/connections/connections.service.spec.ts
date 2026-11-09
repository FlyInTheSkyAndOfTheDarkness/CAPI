import { ConfigService } from '@nestjs/config';
import { ConnectionsService } from './connections.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { AmocrmService } from './amocrm.service';
import { Bitrix24Service } from './bitrix24.service';

describe('Диагностика входящих событий Битрикс24', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  function setup(lastEvent: { createdAt: Date; processedAt: Date | null; error: string | null } | null) {
    const prisma = {
      crmConnection: { findFirst: jest.fn().mockResolvedValue({ id: 'connection', type: 'BITRIX24' }) },
      webhookEvent: { findFirst: jest.fn().mockResolvedValue(lastEvent) },
      eventMapping: { count: jest.fn().mockResolvedValue(8) },
    };
    const bitrix = {
      testConnection: jest.fn().mockResolvedValue(undefined),
      getPipelines: jest.fn().mockResolvedValue({ lead: [], deal: [{ id: '0' }] }),
    };
    return new ConnectionsService(
      prisma as unknown as PrismaService, {} as ConfigService, {} as CryptoService,
      {} as AmocrmService, bitrix as unknown as Bitrix24Service,
    );
  }

  it('предлагает сверить адрес вебхука, когда события ещё не получены', async () => {
    const checks = await setup(null).diagnostics('workspace', 'connection');
    expect(checks).toContainEqual(expect.objectContaining({
      key: 'webhook', status: 'warn', detail: expect.stringContaining('При пересоздании подключения URL меняется'),
    }));
    expect(checks.some((check) => check.key === 'processing')).toBe(false);
  });

  it.each([
    { processedAt: null, error: null, status: 'warn' },
    { processedAt: now, error: null, status: 'ok' },
    { processedAt: null, error: 'Bitrix24: доступ запрещён', status: 'fail' },
  ])('показывает состояние обработки: $status', async ({ processedAt, error, status }) => {
    const checks = await setup({ createdAt: now, processedAt, error }).diagnostics('workspace', 'connection');
    expect(checks).toContainEqual(expect.objectContaining({ key: 'processing', status }));
    if (error) expect(checks.find((check) => check.key === 'processing')?.detail).toContain(error);
  });
});
