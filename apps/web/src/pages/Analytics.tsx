import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AnalyticsData, FilterOptions } from '../lib/types';
import { Card, PageHeader, Select } from '../components/ui';
import { BreakdownCard } from '../components/analytics';
import { Heatmap, TrendChart } from '../components/charts';

const RANGES = [
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
  { days: 30, label: '30 дней' },
];
const nf = new Intl.NumberFormat('ru-RU');

interface Filters {
  connectionId: string;
  destinationId: string;
  eventName: string;
}
const EMPTY: Filters = { connectionId: '', destinationId: '', eventName: '' };

function dur(s: number): string {
  if (!s || s < 0) return '—';
  if (s < 60) return `${s.toFixed(1)} с`;
  if (s < 3600) return `${(s / 60).toFixed(1)} мин`;
  return `${(s / 3600).toFixed(1)} ч`;
}
function money(v: number, cur: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${nf.format(Math.round(v))} ${cur}`;
  }
}
function pctPoints(a: number | null, b: number | null): string | null {
  if (a == null || b == null) return null;
  const d = Math.round((a - b) * 100);
  return `${d >= 0 ? '+' : ''}${d} п.п.`;
}
function deltaPct(cur: number, prev: number): string | null {
  if (!prev) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d >= 0 ? '+' : ''}${d}%`;
}

function Delta({ text, good }: { text: string | null; good: boolean }) {
  if (!text) return null;
  const up = text.startsWith('+');
  const positive = up === good;
  return (
    <span className={`ml-2 text-xs font-medium ${positive ? 'text-green-600' : 'text-red-600'}`}>{text}</span>
  );
}

export default function Analytics() {
  const [range, setRange] = useState(14);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<FilterOptions>('/logs/filters').then(setOptions).catch(() => {});
  }, []);

  const query = useCallback(() => {
    const qs = new URLSearchParams({ days: String(range) });
    if (filters.connectionId) qs.set('connectionId', filters.connectionId);
    if (filters.destinationId) qs.set('destinationId', filters.destinationId);
    if (filters.eventName) qs.set('eventName', filters.eventName);
    return qs.toString();
  }, [range, filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<AnalyticsData>(`/logs/analytics?${query()}`)
      .then((d) => !cancelled && setData(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const o = data?.overview;
  const rel = data?.reliability;
  const relTotal = rel ? rel.first_try + rel.retried + rel.failed : 0;
  const mq = data?.matchQuality;
  const hasFilters = filters.connectionId || filters.destinationId || filters.eventName;

  const mqBar = (label: string, count: number) => {
    const total = mq?.total ?? 0;
    const p = total > 0 ? count / total : 0;
    return (
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-slate-700">{label}</span>
          <span className="tabular-nums text-slate-500">
            {nf.format(count)} <span className="text-xs">· {Math.round(p * 100)}%</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${Math.round(p * 100)}%`, background: '#2a78d6' }} />
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Аналитика" />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                range === r.days ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="w-44">
          <Select value={filters.connectionId} onChange={(e) => setFilters({ ...filters, connectionId: e.target.value })}>
            <option value="">Все подключения</option>
            {options?.connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={filters.destinationId} onChange={(e) => setFilters({ ...filters, destinationId: e.target.value })}>
            <option value="">Все направления</option>
            {options?.destinations.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.type})</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={filters.eventName} onChange={(e) => setFilters({ ...filters, eventName: e.target.value })}>
            <option value="">Все события</option>
            {options?.eventNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <button onClick={() => setFilters(EMPTY)} className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Сбросить
          </button>
        )}
      </div>

      <div className={`transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        {/* Обзор с дельтой период-к-периоду */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <div className="text-sm text-slate-500">Всего конверсий</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">
              {o ? nf.format(o.total) : '—'}
              {o && <Delta text={deltaPct(o.total, o.prev.total)} good />}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">Success rate</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">
              {o?.successRate == null ? '—' : `${Math.round(o.successRate * 100)}%`}
              {o && <Delta text={pctPoints(o.successRate, o.prev.successRate)} good />}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: '#0ca30c' }} />Отправлено
            </div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">
              {o ? nf.format(o.sent) : '—'}
              {o && <Delta text={deltaPct(o.sent, o.prev.sent)} good />}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: '#d03b3b' }} />Ошибки
            </div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{o ? nf.format(o.failed) : '—'}</div>
          </Card>
        </div>

        {/* Тренд success rate */}
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-slate-900">Тренд success rate</h2>
          <TrendChart points={data?.successTrend ?? []} />
        </Card>

        {/* Задержка + надёжность */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold text-slate-900">Задержка доставки</h2>
            <p className="mb-3 text-xs text-slate-500">От приёма события из CRM до отправки в платформу</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Средняя', v: data?.latency.avg },
                { label: 'Медиана', v: data?.latency.median },
                { label: 'p90', v: data?.latency.p90 },
              ].map((t) => (
                <div key={t.label} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t.label}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{t.v != null ? dur(t.v) : '—'}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-400">по {nf.format(data?.latency.count ?? 0)} доставкам</div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-slate-900">Надёжность доставки</h2>
            {relTotal === 0 ? (
              <p className="text-sm text-slate-500">Пока нет доставок.</p>
            ) : (
              <>
                <div className="mb-3 flex h-3 overflow-hidden rounded-full">
                  {[
                    { v: rel!.first_try, c: '#0ca30c' },
                    { v: rel!.retried, c: '#d97706' },
                    { v: rel!.failed, c: '#d03b3b' },
                  ].map((s, i) => (
                    <div key={i} style={{ width: `${(s.v / relTotal) * 100}%`, background: s.c }} />
                  ))}
                </div>
                <ul className="space-y-1.5 text-sm">
                  {[
                    { label: 'С первой попытки', v: rel!.first_try, c: '#0ca30c' },
                    { label: 'Доставлено после ретраёв', v: rel!.retried, c: '#d97706' },
                    { label: 'Провалено (исчерпаны попытки)', v: rel!.failed, c: '#d03b3b' },
                  ].map((s) => (
                    <li key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />
                        {s.label}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {nf.format(s.v)} <span className="text-xs">· {Math.round((s.v / relTotal) * 100)}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        {/* Качество матчинга + выручка */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-1 font-semibold text-slate-900">Качество матчинга</h2>
            <p className="mb-3 text-xs text-slate-500">
              Покрытие идентификаторов — чем выше, тем лучше платформа сопоставит конверсию с пользователем
            </p>
            {(mq?.total ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">Пока нет доставок.</p>
            ) : (
              <div className="space-y-3">
                {mqBar('Click-id (fbclid/gclid/ttclid)', mq!.click_id)}
                {mqBar('Email', mq!.email)}
                {mqBar('Телефон', mq!.phone)}
                {mqBar('External ID', mq!.external_id)}
                {mq!.none > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {nf.format(mq!.none)} конверсий без единого идентификатора — платформа их почти не сматчит.
                    Проверьте заполнение email/телефона в CRM.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold text-slate-900">Выручка (переданная)</h2>
            <p className="mb-3 text-xs text-slate-500">Сумма отправленных конверсий с value</p>
            {(data?.value.count ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">Нет конверсий с суммой (включите «Передавать сумму» в маппинге).</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Всего</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {money(data!.value.total, data!.value.byCurrency[0]?.currency ?? 'RUB')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Средний чек</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {money(data!.value.total / data!.value.count, data!.value.byCurrency[0]?.currency ?? 'RUB')}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {data!.value.byCurrency.map((c) => (
                    <li key={c.currency} className="flex justify-between text-slate-600">
                      <span>{c.currency}</span>
                      <span className="tabular-nums">
                        {money(c.total, c.currency)} <span className="text-xs text-slate-400">· {nf.format(c.count)} шт.</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        {/* Тепловая карта активности */}
        <Card className="mb-6">
          <h2 className="mb-1 font-semibold text-slate-900">Активность по времени</h2>
          <p className="mb-3 text-xs text-slate-500">Когда приходят конверсии — день недели × час (UTC)</p>
          <Heatmap cells={data?.heatmap ?? []} />
        </Card>

        {/* Разрезы по подключениям и маппингам */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="По подключениям CRM" rows={data?.byConnection ?? []} emptyHint="Пока нет доставок по подключениям." />
          <BreakdownCard title="По маппингам" rows={data?.byMapping ?? []} emptyHint="Пока нет доставок по маппингам." />
        </div>
      </div>
    </div>
  );
}
