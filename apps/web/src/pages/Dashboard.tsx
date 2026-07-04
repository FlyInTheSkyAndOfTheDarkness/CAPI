import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { BreakdownRow, ErrorRow, FilterOptions, FunnelRow, Stats } from '../lib/types';
import { Card, PageHeader, Select } from '../components/ui';
import DeliveryChart, { DeliveryTable, STATUS_SERIES } from '../components/DeliveryChart';
import { BreakdownCard, ErrorSummary, Funnel } from '../components/analytics';
import AdvisorPanel from '../components/AdvisorPanel';

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

const EMPTY_FILTERS: Filters = { connectionId: '', destinationId: '', eventName: '' };

export default function Dashboard() {
  const [range, setRange] = useState(14);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [options, setOptions] = useState<FilterOptions | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [byDestination, setByDestination] = useState<BreakdownRow[]>([]);
  const [byEvent, setByEvent] = useState<BreakdownRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'chart' | 'table'>('chart');

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
    const qs = query();
    Promise.all([
      api<Stats>(`/logs/stats?${qs}`),
      api<BreakdownRow[]>(`/logs/breakdown?by=destination&${qs}`),
      api<BreakdownRow[]>(`/logs/breakdown?by=event&${qs}`),
      api<ErrorRow[]>(`/logs/errors?${qs}`),
      api<FunnelRow[]>(`/logs/funnel?${qs}`),
    ])
      .then(([s, bd, be, er, fn]) => {
        if (cancelled) return;
        setStats(s);
        setByDestination(bd);
        setByEvent(be);
        setErrors(er);
        setFunnel(fn);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const successRate = stats?.successRate ?? null;
  const successColor =
    successRate == null ? '#0f172a' : successRate >= 0.9 ? '#0ca30c' : successRate >= 0.7 ? '#b45309' : '#d03b3b';

  const tiles = [
    {
      label: 'Success rate',
      value: successRate == null ? '—' : `${Math.round(successRate * 100)}%`,
      color: successColor,
      dot: null,
    },
    { label: 'Отправлено', value: stats ? nf.format(stats.deliveries.SENT) : '—', color: '#0f172a', dot: STATUS_SERIES[0].color },
    { label: 'Ошибки', value: stats ? nf.format(stats.deliveries.FAILED) : '—', color: '#0f172a', dot: STATUS_SERIES[1].color },
    { label: 'В очереди', value: stats ? nf.format(stats.deliveries.PENDING) : '—', color: '#0f172a', dot: STATUS_SERIES[2].color },
  ];

  const setupSteps = [
    { to: '/connections', label: 'Подключите amoCRM или Битрикс24', done: (stats?.connections ?? 0) > 0 },
    { to: '/destinations', label: 'Добавьте Meta Pixel или TikTok', done: (stats?.destinations ?? 0) > 0 },
    { to: '/mappings', label: 'Настройте маппинг: этап воронки → событие', done: (stats?.mappings ?? 0) > 0 },
  ];

  const hasFilters = filters.connectionId || filters.destinationId || filters.eventName;

  return (
    <div>
      <PageHeader title="Дашборд" />

      {/* Фильтры: период + срез. Один ряд над всем контентом, масштабирует все блоки. */}
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

        <div className="w-48">
          <Select
            value={filters.connectionId}
            onChange={(e) => setFilters({ ...filters, connectionId: e.target.value })}
          >
            <option value="">Все подключения</option>
            {options?.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={filters.destinationId}
            onChange={(e) => setFilters({ ...filters, destinationId: e.target.value })}
          >
            <option value="">Все направления</option>
            {options?.destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.type})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            value={filters.eventName}
            onChange={(e) => setFilters({ ...filters, eventName: e.target.value })}
          >
            <option value="">Все события</option>
            {options?.eventNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* При рефетче держим предыдущий кадр с пониженной прозрачностью */}
      <div className={`transition-opacity ${loading && stats ? 'opacity-60' : ''}`}>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label}>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {t.dot && <span className="h-2 w-2 rounded-full" style={{ background: t.dot }} />}
                <span>{t.label}</span>
              </div>
              <div className="mt-1 text-3xl font-semibold" style={{ color: t.color }}>
                {t.value}
              </div>
            </Card>
          ))}
        </div>

        <div className="mb-6">
          <AdvisorPanel />
        </div>

        <Card className="mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Доставки по дням</h2>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {(
                [
                  { key: 'chart', label: 'График' },
                  { key: 'table', label: 'Таблица' },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === v.key ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {view === 'chart' ? (
            <DeliveryChart days={stats?.days ?? []} />
          ) : (
            <DeliveryTable days={stats?.days ?? []} />
          )}
        </Card>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <BreakdownCard
            title="По направлениям"
            rows={byDestination}
            emptyHint="Пока нет доставок в разрезе направлений."
          />
          <BreakdownCard
            title="По событиям"
            rows={byEvent}
            emptyHint="Пока нет доставок в разрезе событий."
          />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <ErrorSummary errors={errors} />
          <Funnel rows={funnel} />
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">Быстрый старт</h2>
        <ol className="space-y-2">
          {setupSteps.map((step, i) => (
            <li key={step.to} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  step.done ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <Link to={step.to} className="text-indigo-600 hover:text-indigo-800">
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
