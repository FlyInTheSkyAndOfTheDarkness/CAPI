import { periodDays, previousPeriod, resolvePeriod } from './period';

const DAY = 86_400_000;

describe('resolvePeriod', () => {
  it('пресет «последние N дней» кончается сегодня', () => {
    const p = resolvePeriod({ days: '7' });
    const today = new Date().toISOString().slice(0, 10);
    expect(p.days).toBe(7);
    expect(p.to).toBe(today);
    expect(p.until.getTime() - p.since.getTime()).toBe(7 * DAY);
  });

  it('«сегодня» — это ровно одни сутки', () => {
    const p = resolvePeriod({ days: '1' });
    expect(p.days).toBe(1);
    expect(p.from).toBe(p.to);
  });

  it('произвольный диапазон включает обе границы', () => {
    const p = resolvePeriod({ from: '2026-07-20', to: '2026-07-24' });
    expect(p).toMatchObject({ days: 5, from: '2026-07-20', to: '2026-07-24' });
    expect(p.since.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    // Верхняя граница исключающая — начало дня, следующего за последним
    expect(p.until.toISOString()).toBe('2026-07-25T00:00:00.000Z');
  });

  it('одна дата без `to` — один день', () => {
    expect(resolvePeriod({ from: '2026-07-20' })).toMatchObject({
      days: 1,
      from: '2026-07-20',
      to: '2026-07-20',
    });
  });

  it('перепутанные местами границы не роняют запрос', () => {
    expect(resolvePeriod({ from: '2026-07-24', to: '2026-07-20' })).toMatchObject({
      days: 1,
      from: '2026-07-24',
    });
  });

  it('произвольный диапазон ограничен годом', () => {
    expect(resolvePeriod({ from: '2020-01-01', to: '2026-01-01' }).days).toBe(366);
  });

  it('пресет ограничен 90 днями, мусор откатывается к 7', () => {
    expect(resolvePeriod({ days: '5000' }).days).toBe(90);
    expect(resolvePeriod({ days: 'abc' }).days).toBe(7);
    expect(resolvePeriod({ days: '0' }).days).toBe(7);
    expect(resolvePeriod({}).days).toBe(7);
  });

  it('некорректная дата игнорируется в пользу пресета', () => {
    expect(resolvePeriod({ from: '20.07.2026', days: '30' }).days).toBe(30);
  });
});

describe('previousPeriod', () => {
  it('равен по длине и примыкает к началу текущего', () => {
    const cur = resolvePeriod({ from: '2026-07-20', to: '2026-07-24' });
    const prev = previousPeriod(cur);
    expect(prev.days).toBe(cur.days);
    expect(prev.until).toEqual(cur.since);
    expect(prev).toMatchObject({ from: '2026-07-15', to: '2026-07-19' });
  });
});

describe('periodDays', () => {
  it('даёт сетку дней по границам периода', () => {
    expect(periodDays(resolvePeriod({ from: '2026-07-20', to: '2026-07-23' }))).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
    ]);
  });
});
