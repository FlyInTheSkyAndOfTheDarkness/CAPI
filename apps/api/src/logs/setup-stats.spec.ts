import { PrismaService } from '../prisma/prisma.service';
import { LogsService } from './logs.service';
import { resolvePeriod } from './period';

describe('Подтверждение первой доставки', () => {
  function setup(delivery: { id: string } | null) {
    const prisma = {
      deliveryLog: {
        groupBy: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(delivery),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      crmConnection: { count: jest.fn().mockResolvedValue(1) },
      destination: { count: jest.fn().mockResolvedValue(1) },
      eventMapping: { count: jest.fn().mockResolvedValue(8), findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service: new LogsService(prisma as unknown as PrismaService), prisma };
  }

  it('сохраняет подтверждение при выборе периода без доставок', async () => {
    const { service, prisma } = setup({ id: 'old-delivery' });
    const stats = await service.stats('workspace', resolvePeriod({ from: '2026-01-01', to: '2026-01-01' }), {});
    expect(stats.hasSuccessfulDelivery).toBe(true);
    expect(prisma.deliveryLog.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace', status: 'SENT' }, select: { id: true },
    });
  });

  it.each([{ mappingIds: [] }, { mappingIds: ['allowed-mapping'] }])('соблюдает доступ наблюдателя с маппингами $mappingIds', async ({ mappingIds }) => {
    const { service, prisma } = setup(null);
    const stats = await service.stats('workspace', resolvePeriod(), { mappingIds });
    expect(stats.hasSuccessfulDelivery).toBe(false);
    expect(prisma.deliveryLog.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace', status: 'SENT', mappingId: { in: mappingIds } }, select: { id: true },
    });
  });
});
