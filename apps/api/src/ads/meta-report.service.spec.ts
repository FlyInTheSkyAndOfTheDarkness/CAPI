import { ConfigService } from '@nestjs/config';
import { Destination } from '@prisma/client';
import { CryptoService } from '../common/crypto.service';
import { resolvePeriod } from '../logs/period';
import { MetaInsightsService } from './meta-insights.service';
import { budget, MetaReportService, parseIds, periodBuckets, toMetrics } from './meta-report.service';

describe('Просмотр кабинета Meta (Ads Manager)', () => {
  const crypto = new CryptoService(new ConfigService({ ENCRYPTION_KEY: 'test-key' }));
  const destination = {
    id: 'meta', type: 'META', pixelId: '1',
    accessToken: crypto.encrypt('conversion-token'),
    adsAccessToken: crypto.encrypt('reports-token'),
    config: { adAccountId: 'act_456' },
  } as unknown as Destination;
  const period = resolvePeriod({ from: '2026-10-01', to: '2026-10-03' });
  let urls: URL[];

  /** Заглушка Graph API: ответ выбирается по пути и параметрам запроса. */
  const graph = (route: (url: URL) => unknown) => {
    urls = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      return new Response(JSON.stringify(route(url)));
    });
  };
  afterEach(() => jest.restoreAllMocks());

  const service = () => new MetaReportService(new MetaInsightsService(crypto));

  it('считает производные метрики сам, а не из строк Meta', () => {
    const m = toMetrics({
      spend: '100', impressions: '2000', reach: '800', clicks: '60', inline_link_clicks: '40',
      actions: [{ action_type: 'lead', value: '5' }],
    });
    expect(m).toMatchObject({ frequency: 2.5, ctr: 2, cpc: 2.5, cpm: 50, cpl: 20, leads: 5 });
    expect(toMetrics(undefined)).toMatchObject({ spend: 0, cpc: null, cpl: null });
  });

  it('переводит бюджет из минимальных единиц с учётом валюты', () => {
    expect(budget('500000', 'KZT')).toBe(5000);
    expect(budget('3000', 'JPY')).toBe(3000);
    expect(budget(undefined, 'USD')).toBeNull();
    expect(budget('0', 'USD')).toBeNull();
  });

  it('пропускает в фильтр только числовые ID', () => {
    expect(parseIds('12, abc,34')).toEqual(['12', '34']);
    expect(parseIds('')).toBeUndefined();
    expect(() => parseIds(Array.from({ length: 51 }, (_, i) => i + 1).join(','))).toThrow();
  });

  it('объединяет список объектов со статистикой; итог — отдельным запросом уровня кабинета', async () => {
    graph((url) => {
      if (url.pathname.endsWith('/act_456')) return { name: 'BePRO', currency: 'KZT', timezone_name: 'Asia/Almaty' };
      if (url.pathname.endsWith('/adsets')) {
        return {
          data: [
            { id: '11', name: 'Без показов', effective_status: 'PAUSED', campaign: { id: '1', name: 'C' } },
            { id: '12', name: 'Своя', effective_status: 'ACTIVE', campaign: { id: '1', name: 'C' }, daily_budget: '1000000' },
          ],
        };
      }
      if (url.searchParams.get('level') === 'account') {
        return { data: [{ spend: '300', impressions: '1000', reach: '500' }] };
      }
      return {
        data: [
          { adset_id: '12', adset_name: 'Своя', campaign_id: '1', spend: '200', impressions: '600', reach: '400' },
          { adset_id: '13', adset_name: 'Архив', campaign_id: '1', campaign_name: 'C', spend: '100', impressions: '400', reach: '300' },
        ],
      };
    });

    const report = await service().report(destination, 'adset', period, { campaignIds: ['1'] });

    expect(report).toMatchObject({ currency: 'KZT', accountName: 'BePRO', timezone: 'Asia/Almaty' });
    expect(report.rows.map((r) => [r.id, r.status, r.spend])).toEqual([
      ['12', 'ACTIVE', 200],
      ['13', 'DELETED_OR_ARCHIVED', 100],
      ['11', 'PAUSED', 0],
    ]);
    expect(report.rows[0]).toMatchObject({ dailyBudget: 10000, budgetOnCampaign: false, campaignName: 'C' });
    expect(report.rows[2]).toMatchObject({ budgetOnCampaign: true });
    // Охват итога — от Meta, а не сумма охватов групп (400 + 300)
    expect(report.totals).toMatchObject({ reach: 500, frequency: 2 });

    expect(urls.every((u) => u.searchParams.get('access_token') === 'reports-token')).toBe(true);
    const structure = urls.find((u) => u.pathname.endsWith('/adsets'))!;
    expect(JSON.parse(structure.searchParams.get('filtering')!)).toEqual(
      expect.arrayContaining([{ field: 'campaign.id', operator: 'IN', value: ['1'] }]),
    );
  });

  it('заполняет дни без показов нулями и фильтрует по выбранному объекту', async () => {
    graph((url) => {
      if (url.pathname.endsWith('/act_456')) return { currency: 'USD' };
      if (url.searchParams.get('time_increment') === '1') {
        return { data: [{ date_start: '2026-10-02', spend: '50', impressions: '100', reach: '80' }] };
      }
      return { data: [{ spend: '50', impressions: '100', reach: '80' }] };
    });

    const daily = await service().daily(destination, period, { level: 'ad', id: '99' });

    expect(daily.days.map((d) => [d.date, d.spend])).toEqual([
      ['2026-10-01', 0],
      ['2026-10-02', 50],
      ['2026-10-03', 0],
    ]);
    expect(daily).toMatchObject({ level: 'ad', id: '99', currency: 'USD', granularity: 'day' });
    const insight = urls.find((u) => u.searchParams.get('time_increment') === '1')!;
    expect(JSON.parse(insight.searchParams.get('filtering')!)).toEqual([
      { field: 'ad.id', operator: 'EQUAL', value: '99' },
    ]);
  });

  it('делит период на календарные недели (пн–вс) и месяцы с обрезкой по краям', () => {
    const p = resolvePeriod({ from: '2026-10-29', to: '2026-11-10' });
    expect(periodBuckets(p, 'week')).toEqual([
      { from: '2026-10-29', to: '2026-11-01' },
      { from: '2026-11-02', to: '2026-11-08' },
      { from: '2026-11-09', to: '2026-11-10' },
    ]);
    expect(periodBuckets(p, 'month')).toEqual([
      { from: '2026-10-29', to: '2026-10-31' },
      { from: '2026-11-01', to: '2026-11-10' },
    ]);
    expect(periodBuckets(p, 'day')).toHaveLength(13);
  });

  it('недели запрашивает у Meta отрезками time_ranges, а не складывает дни', async () => {
    graph((url) => {
      if (url.pathname.endsWith('/act_456')) return { currency: 'KZT' };
      const ranges = url.searchParams.get('time_ranges');
      if (ranges) {
        return {
          data: (JSON.parse(ranges) as Array<{ since: string; until: string }>).map((r, i) => ({
            date_start: r.since, date_stop: r.until, spend: String(100 * (i + 1)), impressions: '1000', reach: '400',
          })),
        };
      }
      return { data: [{ spend: '300', impressions: '2000', reach: '600' }] };
    });

    const p = resolvePeriod({ from: '2026-11-01', to: '2026-11-10' });
    const weekly = await service().daily(destination, p, undefined, 'week');

    expect(weekly.granularity).toBe('week');
    expect(weekly.days.map((d) => [d.date, d.dateTo, d.spend, d.frequency])).toEqual([
      ['2026-11-01', '2026-11-01', 100, 2.5],
      ['2026-11-02', '2026-11-08', 200, 2.5],
      ['2026-11-09', '2026-11-10', 300, 2.5],
    ]);
    const insight = urls.find((u) => u.searchParams.has('time_ranges'))!;
    expect(insight.searchParams.has('time_range')).toBe(false);
    expect(insight.searchParams.has('time_increment')).toBe(false);
  });

  it('отдаёт понятную ошибку Meta и кэширует успешные ответы', async () => {
    graph(() => ({ error: { code: 190, message: 'expired' } }));
    await expect(service().daily(destination, period)).rejects.toThrow(/Токен недействителен/);

    graph(() => ({ data: [] }));
    const s = service();
    await s.daily(destination, period);
    const first = urls.length;
    await s.daily(destination, period);
    expect(urls.length).toBe(first);
  });

  it('требует ID рекламного кабинета', async () => {
    await expect(
      service().report({ ...destination, config: {} } as Destination, 'campaign', period),
    ).rejects.toThrow(/ID рекламного кабинета/);
  });
});
