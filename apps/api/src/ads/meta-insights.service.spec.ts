import { ConfigService } from '@nestjs/config';
import { Destination } from '@prisma/client';
import { CryptoService } from '../common/crypto.service';
import { MetaSender } from '../delivery/senders/meta.sender';
import { resolvePeriod } from '../logs/period';
import { MetaInsightsService } from './meta-insights.service';

describe('Раздельные токены Meta', () => {
  const crypto = new CryptoService(new ConfigService({ ENCRYPTION_KEY: 'test-key' }));
  const destination = {
    id: 'meta', type: 'META', pixelId: '123',
    accessToken: crypto.encrypt('conversion-token'),
    adsAccessToken: crypto.encrypt('reports-token'),
    config: { adAccountId: '456' },
  } as unknown as Destination;
  const period = resolvePeriod({ from: '2026-10-01', to: '2026-10-02' });
  let request: jest.SpyInstance;

  beforeEach(() => {
    request = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      name: 'BePRO', currency: 'KZT', data: [], events_received: 1,
    }), { status: 200 }));
  });
  afterEach(() => jest.restoreAllMocks());

  const tokens = () => request.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('access_token'));

  it('использует отдельный токен в проверке кабинета и запросе отчёта', async () => {
    const service = new MetaInsightsService(crypto);
    // Каждый ответ читается один раз, как настоящий ответ fetch.
    request.mockImplementation(async () => new Response(JSON.stringify({
      name: 'BePRO', currency: 'KZT', data: [],
    })));
    await expect(service.check(destination)).resolves.toMatchObject({ ok: true });
    await service.insights(destination, period);
    expect(tokens()).toEqual(['reports-token', 'reports-token', 'reports-token']);
  });

  it('сохраняет совместимость с направлениями без отдельного токена', async () => {
    await new MetaInsightsService(crypto).insights({ ...destination, adsAccessToken: null }, period);
    expect(tokens()).toEqual(['conversion-token']);
  });

  it('не выдаёт старый кэш после замены или удаления токена', async () => {
    request.mockImplementation(async () => new Response(JSON.stringify({ data: [] })));
    const service = new MetaInsightsService(crypto);
    await service.insights(destination, period);
    await service.insights(destination, period);
    await service.insights({ ...destination, adsAccessToken: crypto.encrypt('new-reports-token') }, period);
    await service.insights({ ...destination, adsAccessToken: null }, period);
    expect(tokens()).toEqual(['reports-token', 'new-reports-token', 'conversion-token']);
  });

  it('продолжает отправлять конверсии основным токеном', async () => {
    await new MetaSender(crypto).send(destination, {
      eventName: 'Lead', eventTime: 1, eventId: 'test', externalId: 'test', currency: 'KZT',
    });
    expect(tokens()).toEqual(['conversion-token']);
  });
});
