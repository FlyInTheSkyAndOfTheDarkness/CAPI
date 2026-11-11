import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Destination, MetaDaily, MetaGranularity, MetaLevel, MetaMetrics, MetaReport, MetaReportRow } from '../lib/types';
import { Button, Card, Input, PageHeader, Select } from '../components/ui';
import PeriodPicker, { DEFAULT_PERIOD, periodLabel, periodParams, type PeriodValue } from '../components/PeriodPicker';
import { DailyBars } from '../components/charts';

/**
 * Рекламный кабинет Meta в виде Ads Manager — только просмотр.
 * Вкладки кампаний / групп / объявлений: отметьте кампании, и вкладка групп
 * покажет только их группы (как в Ads Manager). Кнопка «Динамика» у строки
 * переключает график и таблицу дней на выбранный объект.
 */

const nf = new Intl.NumberFormat('ru-RU');
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

function money(v: number | null, cur: string): string {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
    }).format(v);
  } catch {
    return `${nf.format(Math.round(v))} ${cur}`;
  }
}

const LEVELS: Array<{ key: MetaLevel; label: string }> = [
  { key: 'campaign', label: 'Кампании' },
  { key: 'adset', label: 'Группы объявлений' },
  { key: 'ad', label: 'Объявления' },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Активно', cls: 'bg-green-100 text-green-700' },
  PAUSED: { label: 'Пауза', cls: 'bg-slate-100 text-slate-600' },
  CAMPAIGN_PAUSED: { label: 'Кампания на паузе', cls: 'bg-slate-100 text-slate-600' },
  ADSET_PAUSED: { label: 'Группа на паузе', cls: 'bg-slate-100 text-slate-600' },
  PENDING_REVIEW: { label: 'На проверке', cls: 'bg-amber-100 text-amber-700' },
  IN_PROCESS: { label: 'Обрабатывается', cls: 'bg-amber-100 text-amber-700' },
  PREAPPROVED: { label: 'Предодобрено', cls: 'bg-amber-100 text-amber-700' },
  WITH_ISSUES: { label: 'Есть проблемы', cls: 'bg-red-100 text-red-700' },
  DISAPPROVED: { label: 'Отклонено', cls: 'bg-red-100 text-red-700' },
  PENDING_BILLING_INFO: { label: 'Нужна оплата', cls: 'bg-red-100 text-red-700' },
  DELETED_OR_ARCHIVED: { label: 'Архив / удалено', cls: 'bg-slate-100 text-slate-400' },
};

type StatusFilter = 'delivered' | 'active' | 'all';
type SortKey = keyof MetaMetrics | 'name' | 'budget';

interface Column {
  key: SortKey;
  label: string;
  value: (r: MetaMetrics, cur: string) => string;
}

const COLUMNS: Column[] = [
  { key: 'spend', label: 'Расход', value: (r, c) => money(r.spend, c) },
  { key: 'impressions', label: 'Показы', value: (r) => nf.format(r.impressions) },
  { key: 'reach', label: 'Охват', value: (r) => nf.format(r.reach) },
  { key: 'frequency', label: 'Частота', value: (r) => (r.reach ? nf2.format(r.frequency) : '—') },
  { key: 'linkClicks', label: 'Клики по ссылке', value: (r) => nf.format(r.linkClicks) },
  { key: 'ctr', label: 'CTR', value: (r) => (r.impressions ? `${nf2.format(r.ctr)}%` : '—') },
  { key: 'cpc', label: 'CPC', value: (r, c) => money(r.cpc, c) },
  { key: 'cpm', label: 'CPM', value: (r, c) => money(r.cpm, c) },
  { key: 'leads', label: 'Лиды', value: (r) => nf.format(r.leads) },
  { key: 'cpl', label: 'Цена лида', value: (r, c) => money(r.cpl, c) },
];

/** Метрики, доступные для графика по дням. */
const CHART_METRICS: Array<{ key: keyof MetaMetrics; label: string; money?: boolean; percent?: boolean }> = [
  { key: 'spend', label: 'Расход', money: true },
  { key: 'leads', label: 'Лиды' },
  { key: 'cpl', label: 'Цена лида', money: true },
  { key: 'impressions', label: 'Показы' },
  { key: 'reach', label: 'Охват' },
  { key: 'linkClicks', label: 'Клики по ссылке' },
  { key: 'ctr', label: 'CTR', percent: true },
  { key: 'cpm', label: 'CPM', money: true },
];

function budgetLabel(r: MetaReportRow, cur: string, level: MetaLevel): string {
  if (r.dailyBudget != null) return `${money(r.dailyBudget, cur)} / день`;
  if (r.lifetimeBudget != null) return `${money(r.lifetimeBudget, cur)} всего`;
  if (r.budgetOnCampaign) return 'Бюджет кампании';
  // Кампания без своего бюджета — бюджеты заданы в группах
  if (level === 'campaign' && r.status !== 'DELETED_OR_ARCHIVED') return 'Бюджет групп';
  return '—';
}

function budgetValue(r: MetaReportRow): number {
  return r.dailyBudget ?? r.lifetimeBudget ?? -1;
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const GRANULARITIES: Array<{ key: MetaGranularity; label: string; word: string; column: string }> = [
  { key: 'day', label: 'Дни', word: 'по дням', column: 'День' },
  { key: 'week', label: 'Недели', word: 'по неделям', column: 'Неделя' },
  { key: 'month', label: 'Месяцы', word: 'по месяцам', column: 'Месяц' },
];

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const lastDayOfMonth = (iso: string) =>
  new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();

/** Подпись отрезка в таблице и подсказке: день, «02.11 — 08.11» или «ноябрь 2026». */
function bucketLabel(from: string, to: string, g: MetaGranularity): string {
  if (g === 'day') return `${ddmm(from)}.${from.slice(0, 4)}`;
  if (g === 'week') return `${ddmm(from)} — ${ddmm(to)}.${to.slice(0, 4)}`;
  const month = `${MONTHS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`;
  const full = from.slice(8) === '01' && Number(to.slice(8)) === lastDayOfMonth(to);
  // Неполный месяц на краю периода — показываем, какие дни вошли
  return full ? month : `${month} (${ddmm(from)} — ${ddmm(to)})`;
}

/** Короткая подпись на оси графика. */
function bucketAxis(from: string, g: MetaGranularity): string {
  return g === 'month' ? `${MONTHS_SHORT[Number(from.slice(5, 7)) - 1]} ${from.slice(2, 4)}` : ddmm(from);
}

interface DailyTarget {
  level: MetaLevel;
  id: string;
  name: string;
}

export default function Ads() {
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [destId, setDestId] = useState('');
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);
  const [level, setLevel] = useState<MetaLevel>('campaign');
  const [selCampaigns, setSelCampaigns] = useState<Map<string, string>>(new Map());
  const [selAdsets, setSelAdsets] = useState<Map<string, string>>(new Map());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('delivered');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'spend', desc: true });
  const [report, setReport] = useState<MetaReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [daily, setDaily] = useState<MetaDaily | null>(null);
  const [dailyError, setDailyError] = useState('');
  const [granularity, setGranularity] = useState<MetaGranularity>('day');
  const [chartMetric, setChartMetric] = useState<keyof MetaMetrics>('spend');
  const [creative, setCreative] = useState<MetaReportRow | null>(null);

  const metaDests = (destinations ?? []).filter((d) => d.type === 'META');
  const selected = metaDests.find((d) => d.id === destId);
  const hasAccount = Boolean(selected?.config?.adAccountId);

  useEffect(() => {
    api<Destination[]>('/destinations')
      .then((list) => {
        setDestinations(list);
        const meta = list.filter((d) => d.type === 'META');
        const preferred = meta.find((d) => d.config?.adAccountId) ?? meta[0];
        if (preferred) setDestId(preferred.id);
      })
      .catch(() => setDestinations([]));
  }, []);

  // Смена кабинета сбрасывает выбор — ID объектов другого кабинета не имеют смысла
  const pickDestination = (id: string) => {
    setDestId(id);
    setSelCampaigns(new Map());
    setSelAdsets(new Map());
    setTarget(null);
    setLevel('campaign');
  };

  const filterQs = useMemo(() => {
    const qs: Record<string, string> = {};
    if (level !== 'campaign' && selCampaigns.size) qs.campaignIds = [...selCampaigns.keys()].join(',');
    if (level === 'ad' && selAdsets.size) qs.adsetIds = [...selAdsets.keys()].join(',');
    return qs;
  }, [level, selCampaigns, selAdsets]);

  useEffect(() => {
    if (!destId || !hasAccount) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setReportError('');
    const qs = new URLSearchParams({ ...periodParams(period), ...filterQs, destinationId: destId, level });
    api<MetaReport>(`/ads/meta/report?${qs}`)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => {
        if (cancelled) return;
        setReport(null);
        setReportError(e instanceof Error ? e.message : 'Не удалось загрузить статистику');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [destId, hasAccount, period, level, filterQs]);

  useEffect(() => {
    if (!destId || !hasAccount) {
      setDaily(null);
      return;
    }
    let cancelled = false;
    setDailyError('');
    const qs = new URLSearchParams({
      ...periodParams(period),
      destinationId: destId,
      granularity,
      ...(target ? { level: target.level, id: target.id } : {}),
    });
    api<MetaDaily>(`/ads/meta/daily?${qs}`)
      .then((d) => !cancelled && setDaily(d))
      .catch((e) => {
        if (cancelled) return;
        setDaily(null);
        setDailyError(e instanceof Error ? e.message : 'Не удалось загрузить динамику');
      });
    return () => {
      cancelled = true;
    };
  }, [destId, hasAccount, period, target, granularity]);

  const currency = report?.currency ?? daily?.currency ?? 'USD';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (report?.rows ?? []).filter((r) => {
      if (statusFilter === 'delivered' && r.impressions === 0 && r.spend === 0) return false;
      if (statusFilter === 'active' && r.status !== 'ACTIVE') return false;
      return !q || r.name.toLowerCase().includes(q) || r.id.includes(q);
    });
    const val = (r: MetaReportRow): number | string =>
      sort.key === 'name' ? r.name.toLowerCase() : sort.key === 'budget' ? budgetValue(r) : (r[sort.key] ?? -1);
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -cmp : cmp;
    });
  }, [report, statusFilter, search, sort]);

  const selection = level === 'campaign' ? selCampaigns : level === 'adset' ? selAdsets : null;
  const setSelection = level === 'campaign' ? setSelCampaigns : setSelAdsets;
  const toggleSelect = (r: MetaReportRow) => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(r.id)) next.delete(r.id);
      else next.set(r.id, r.name);
      return next;
    });
    // Новые кампании меняют набор групп — прежний выбор групп становится неточным
    if (level === 'campaign') setSelAdsets(new Map());
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));

  const step = GRANULARITIES.find((g) => g.key === granularity) ?? GRANULARITIES[0];
  // Пока грузится новый шаг, подписи берём из уже полученных данных
  const shown = daily?.granularity ?? granularity;
  const shownStep = GRANULARITIES.find((g) => g.key === shown) ?? GRANULARITIES[0];
  const dateTo = new Map((daily?.days ?? []).map((d) => [d.date, d.dateTo]));
  const metric = CHART_METRICS.find((m) => m.key === chartMetric) ?? CHART_METRICS[0];
  const formatMetric = (v: number) =>
    metric.money ? money(v, currency) : metric.percent ? `${nf2.format(v)}%` : nf.format(Math.round(v * 100) / 100);

  if (destinations && metaDests.length === 0) {
    return (
      <div>
        <PageHeader title="Реклама" />
        <Card>
          <p className="text-sm text-slate-600">
            Добавьте направление Meta и укажите в нём ID рекламного кабинета — здесь появятся кампании,
            группы и объявления, как в Ads Manager.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Реклама Meta"
        action={
          metaDests.length > 1 ? (
            <div className="w-64">
              <Select value={destId} onChange={(e) => pickDestination(e.target.value)} aria-label="Рекламный кабинет">
                {metaDests.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        {report && (
          <p className="text-xs text-slate-500">
            {report.accountName ?? 'Кабинет'} · {report.currency}
            {report.timezone ? ` · даты по часовому поясу кабинета (${report.timezone})` : ''} · только просмотр
          </p>
        )}
      </div>

      {selected && !hasAccount && (
        <Card className="mb-6">
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Укажите <b>ID рекламного кабинета</b>: «Направления» → {selected.name} → «Изменить» (число из act_… в
            Ads Manager). Токену нужно право <code>ads_read</code>.
          </p>
        </Card>
      )}

      {hasAccount && (
        <>
          {/* Итоги и график по дням */}
          <Card className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {target ? target.name : 'Весь кабинет'} — {periodLabel(period)}
                </h2>
                {target && (
                  <button className="text-xs text-indigo-600 hover:underline" onClick={() => setTarget(null)}>
                    ← Показать весь кабинет
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Разбивка">
                  {GRANULARITIES.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setGranularity(g.key)}
                      aria-pressed={granularity === g.key}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        granularity === g.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
                  {CHART_METRICS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setChartMetric(m.key)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        chartMetric === m.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {dailyError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{dailyError}</p>}
            {daily && (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { label: 'Расход', value: money(daily.totals.spend, currency) },
                    { label: 'Лиды', value: nf.format(daily.totals.leads) },
                    { label: 'Цена лида', value: money(daily.totals.cpl, currency) },
                    { label: 'Охват', value: nf.format(daily.totals.reach) },
                    { label: 'Показы', value: nf.format(daily.totals.impressions) },
                    { label: 'Частота', value: daily.totals.reach ? nf2.format(daily.totals.frequency) : '—' },
                    { label: 'Клики по ссылке', value: nf.format(daily.totals.linkClicks) },
                    { label: 'CTR', value: `${nf2.format(daily.totals.ctr)}%` },
                    { label: 'CPC', value: money(daily.totals.cpc, currency) },
                    { label: 'CPM', value: money(daily.totals.cpm, currency) },
                  ].map((t) => (
                    <div key={t.label} className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">{t.label}</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{t.value}</div>
                    </div>
                  ))}
                </div>
                <h3 className="mb-1 text-sm font-medium text-slate-700">{metric.label} {shownStep.word}</h3>
                <DailyBars
                  points={daily.days.map((d) => ({ date: d.date, value: d[metric.key] as number | null }))}
                  label={metric.label}
                  format={formatMetric}
                  axisLabel={(d) => bucketAxis(d, shown)}
                  tooltipLabel={(d) => bucketLabel(d, dateTo.get(d) ?? d, shown)}
                />
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-indigo-600">Таблица {shownStep.word}</summary>
                  <div className="mt-2 max-h-96 overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                          <th className="px-2 py-2">{shownStep.column}</th>
                          {COLUMNS.map((c) => (
                            <th key={c.key} className="whitespace-nowrap px-2 py-2 text-right">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...daily.days].reverse().map((d) => (
                          <tr key={d.date} className="border-b border-slate-100">
                            <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                              {bucketLabel(d.date, d.dateTo, shown)}
                            </td>
                            {COLUMNS.map((c) => (
                              <td key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                                {c.value(d, currency)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
            {!daily && !dailyError && <p className="py-6 text-sm text-slate-400">Загружаем данные {step.word}…</p>}
          </Card>

          {/* Таблица Ads Manager */}
          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
              <div className="flex gap-1">
                {LEVELS.map((l) => {
                  const count = l.key === 'campaign' ? selCampaigns.size : l.key === 'adset' ? selAdsets.size : 0;
                  return (
                    <button
                      key={l.key}
                      onClick={() => {
                        setLevel(l.key);
                        setSearch('');
                      }}
                      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                        level === l.key
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {l.label}
                      {count > 0 && (
                        <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 text-xs text-indigo-700">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="w-48">
                  <Input placeholder="Поиск по названию или ID" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="w-44">
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                    <option value="delivered">С показами за период</option>
                    <option value="active">Только активные</option>
                    <option value="all">Все</option>
                  </Select>
                </div>
              </div>
            </div>

            {level !== 'campaign' && (selCampaigns.size > 0 || (level === 'ad' && selAdsets.size > 0)) && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>Фильтр:</span>
                {[...selCampaigns.values()].map((n) => (
                  <span key={`c${n}`} className="rounded-full bg-slate-100 px-2 py-0.5">Кампания: {n}</span>
                ))}
                {level === 'ad' &&
                  [...selAdsets.values()].map((n) => (
                    <span key={`s${n}`} className="rounded-full bg-slate-100 px-2 py-0.5">Группа: {n}</span>
                  ))}
                <button
                  className="text-indigo-600 hover:underline"
                  onClick={() => {
                    setSelCampaigns(new Map());
                    setSelAdsets(new Map());
                  }}
                >
                  Сбросить
                </button>
              </div>
            )}

            {reportError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{reportError}</p>}
            {loading && !report && <p className="py-6 text-sm text-slate-400">Загружаем статистику из Meta…</p>}

            {report && (
              <div className={loading ? 'opacity-60 transition-opacity' : ''}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        {selection && <th className="w-8 px-2 py-2" />}
                        <SortTh label="Название" k="name" sort={sort} onSort={toggleSort} left sticky />
                        <th className="px-2 py-2">Статус</th>
                        {level !== 'ad' && <SortTh label="Бюджет" k="budget" sort={sort} onSort={toggleSort} />}
                        {COLUMNS.map((c) => (
                          <SortTh key={c.key} label={c.label} k={c.key} sort={sort} onSort={toggleSort} />
                        ))}
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.id}
                          className={`border-b border-slate-100 hover:bg-slate-50 ${target?.id === r.id ? 'bg-indigo-50/50' : ''}`}
                        >
                          {selection && (
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={selection.has(r.id)}
                                onChange={() => toggleSelect(r)}
                                aria-label={`Выбрать ${r.name}`}
                              />
                            </td>
                          )}
                          <td className="sticky left-0 z-[1] min-w-[220px] bg-white px-2 py-2">
                            <div className="flex items-center gap-2">
                              {level === 'ad' && (
                                <button
                                  onClick={() => setCreative(r)}
                                  className="h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-100"
                                  title="Открыть креатив"
                                >
                                  {r.creative?.thumbnailUrl ? (
                                    <img src={r.creative.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <span className="text-[10px] text-slate-400">нет</span>
                                  )}
                                </button>
                              )}
                              <div className="min-w-0">
                                {level === 'ad' ? (
                                  <button onClick={() => setCreative(r)} className="text-left font-medium text-slate-900 hover:underline">
                                    {r.name}
                                  </button>
                                ) : (
                                  <div className="font-medium text-slate-900">{r.name}</div>
                                )}
                                <div className="truncate text-xs text-slate-400">
                                  {level === 'adset' && r.campaignName}
                                  {level === 'ad' && [r.campaignName, r.adsetName].filter(Boolean).join(' › ')}
                                  {level === 'campaign' && `ID ${r.id}`}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <StatusPill status={r.status} />
                          </td>
                          {level !== 'ad' && (
                            <td className="whitespace-nowrap px-2 py-2 text-right text-slate-600">{budgetLabel(r, currency, level)}</td>
                          )}
                          {COLUMNS.map((c) => (
                            <td key={c.key} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                              {c.value(r, currency)}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-right">
                            <button
                              className="whitespace-nowrap text-xs text-indigo-600 hover:underline"
                              onClick={() => {
                                setTarget({ level, id: r.id, name: r.name });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              Динамика
                            </button>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={COLUMNS.length + 5} className="px-2 py-6 text-center text-sm text-slate-500">
                            {statusFilter === 'delivered'
                              ? 'За период нет объектов с показами. Выберите «Все», чтобы увидеть остальные.'
                              : 'Ничего не найдено.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {rows.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                          {selection && <td />}
                          <td className="sticky left-0 bg-white px-2 py-2" colSpan={level !== 'ad' ? 3 : 2}>
                            Итого{selCampaigns.size || (level === 'ad' && selAdsets.size) ? ' по фильтру' : ' по кабинету'}
                          </td>
                          {COLUMNS.map((c) => (
                            <td key={c.key} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                              {c.value(report.totals, currency)}
                            </td>
                          ))}
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Данные Meta Marketing API, обновляются раз в 10 минут. Итог посчитан Meta для всего кабинета или
                  фильтра: охват не суммируется по строкам. Последние 1–3 дня ещё уточняются атрибуцией.
                </p>
              </div>
            )}
          </Card>
        </>
      )}

      {creative && <CreativeModal row={creative} currency={currency} onClose={() => setCreative(null)} />}
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  left,
  sticky,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  left?: boolean;
  sticky?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={`whitespace-nowrap px-2 py-2 ${left ? '' : 'text-right'} ${sticky ? 'sticky left-0 z-[1] bg-white' : ''}`} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => onSort(k)} className={`uppercase ${active ? 'text-slate-900' : ''}`}>
        {label}
        {active ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );
}

function CreativeModal({ row, currency, onClose }: { row: MetaReportRow; currency: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const img = row.creative?.imageUrl ?? row.creative?.thumbnailUrl;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Креатив ${row.name}`}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{row.name}</h3>
            <p className="text-xs text-slate-500">{[row.campaignName, row.adsetName].filter(Boolean).join(' › ')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Закрыть">
            ✕
          </button>
        </div>
        {img ? (
          <img src={img} alt="" className="mb-3 w-full rounded-lg bg-slate-100 object-contain" />
        ) : (
          <p className="mb-3 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Превью недоступно</p>
        )}
        {row.creative?.objectType === 'VIDEO' && (
          <p className="mb-2 text-xs text-slate-500">Видео — показана обложка. Полный просмотр — по ссылке ниже.</p>
        )}
        {row.creative?.title && <p className="font-medium text-slate-900">{row.creative.title}</p>}
        {row.creative?.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{row.creative.body}</p>}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          {[
            ['Расход', money(row.spend, currency)],
            ['Лиды', nf.format(row.leads)],
            ['Цена лида', money(row.cpl, currency)],
            ['Показы', nf.format(row.impressions)],
            ['CTR', row.impressions ? `${nf2.format(row.ctr)}%` : '—'],
            ['CPC', money(row.cpc, currency)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-slate-50 p-2">
              <div className="text-slate-500">{l}</div>
              <div className="font-semibold tabular-nums text-slate-900">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {row.previewUrl && (
            <a href={row.previewUrl} target="_blank" rel="noreferrer noopener">
              <Button variant="secondary">Превью в Facebook</Button>
            </a>
          )}
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
}
