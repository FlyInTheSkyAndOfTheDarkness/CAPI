import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  AnalyticsData,
  BreakdownRow,
  ErrorRow,
  FilterOptions,
  FunnelRow,
  Stats,
} from '../lib/types';
import { Card, PageHeader, Select } from '../components/ui';
import DeliveryChart, { DeliveryTable, STATUS_SERIES } from '../components/DeliveryChart';
import { BreakdownCard, ErrorSummary, Funnel } from '../components/analytics';
import AdvisorPanel from '../components/AdvisorPanel';
import AnalyticsSection from '../components/AnalyticsSection';
import MetaAdsSection from '../components/MetaAdsSection';
import PeriodPicker, {
  DEFAULT_PERIOD,
  periodParams,
  type PeriodValue,
} from '../components/PeriodPicker';

const nf = new Intl.NumberFormat('ru-RU');

/** Изменение к предыдущему равному периоду: в процентах и в пунктах. */
function deltaPct(cur: number, prev: number): string | null {
  if (!prev) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d >= 0 ? '+' : ''}${d}%`;
}

function pctPoints(a: number | null, b: number | null): string | null {
  if (a == null || b == null) return null;
  const d = Math.round((a - b) * 100);
  return `${d >= 0 ? '+' : ''}${d} п.п.`;
}

function Delta({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span
      className={`ml-2 text-xs font-medium ${
        text.startsWith('+') ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {text}
    </span>
  );
}

interface Filters {
  connectionId: string;
  destinationId: string;
  eventName: string;
}

const EMPTY_FILTERS: Filters = { connectionId: '', destinationId: '', eventName: '' };

export default function Dashboard() {
  const { me } = useAuth();
  // Наблюдателю доступна только аналитика по назначенным ему маппингам
  const isViewer = me?.workspaces[0]?.role === 'VIEWER';
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [options, setOptions] = useState<FilterOptions | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [byDestination, setByDestination] = useState<BreakdownRow[]>([]);
  const [byEvent, setByEvent] = useState<BreakdownRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    void api<FilterOptions>('/logs/filters').then(setOptions).catch(() => {});
  }, []);

  const query = useCallback(() => {
    const qs = new URLSearchParams(periodParams(period));
    if (filters.connectionId) qs.set('connectionId', filters.connectionId);
    if (filters.destinationId) qs.set('destinationId', filters.destinationId);
    if (filters.eventName) qs.set('eventName', filters.eventName);
    return qs.toString();
  }, [period, filters]);

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
      api<AnalyticsData>(`/logs/analytics?${qs}`),
    ])
      .then(([s, bd, be, er, fn, an]) => {
        if (cancelled) return;
        setStats(s);
        setByDestination(bd);
        setByEvent(be);
        setErrors(er);
        setFunnel(fn);
        setAnalytics(an);
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

  // Сравнение с предыдущим равным периодом берём из аналитики
  const ov = analytics?.overview;
  const tiles = [
    {
      label: 'Success rate',
      value: successRate == null ? '—' : `${Math.round(successRate * 100)}%`,
      color: successColor,
      dot: null,
      delta: ov ? pctPoints(ov.successRate, ov.prev.successRate) : null,
    },
    {
      label: 'Отправлено',
      value: stats ? nf.format(stats.deliveries.SENT) : '—',
      color: '#0f172a',
      dot: STATUS_SERIES[0].color,
      delta: ov ? deltaPct(ov.sent, ov.prev.sent) : null,
    },
    {
      label: 'Ошибки',
      value: stats ? nf.format(stats.deliveries.FAILED) : '—',
      color: '#0f172a',
      dot: STATUS_SERIES[1].color,
      delta: null,
    },
    {
      label: 'В очереди',
      value: stats ? nf.format(stats.deliveries.PENDING) : '—',
      color: '#0f172a',
      dot: STATUS_SERIES[2].color,
      delta: null,
    },
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

      {isViewer && (
        <p className="mb-6 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
          Показаны данные только по назначенным вам маппингам.
        </p>
      )}

      {/* Фильтры: период + срез. Один ряд над всем контентом, масштабирует все блоки. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />

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
                <Delta text={t.delta} />
              </div>
            </Card>
          ))}
        </div>

        {/* Советник считает здоровье всего воркспейса — наблюдателю недоступен */}
        {!isViewer && (
          <div className="mb-6">
            <AdvisorPanel />
          </div>
        )}

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

        {/* Детальная аналитика — продолжение дашборда, под теми же фильтрами */}
        <h2 className="mb-4 mt-8 border-t border-slate-200 pt-6 text-lg font-bold text-slate-900">
          Аналитика
        </h2>
        <AnalyticsSection data={analytics} />
      </div>

      {/* Статистика рекламного кабинета Meta — наблюдателю недоступна */}
      {!isViewer && <MetaAdsSection period={period} />}

      {!isViewer && (
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
      )}
    </div>
  );
}
