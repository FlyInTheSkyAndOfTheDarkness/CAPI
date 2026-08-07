import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Destination, MetaAdRow, MetaAdsCheck, MetaAdsInsights } from '../lib/types';
import { Button, Card, Select } from './ui';
import { periodParams, type PeriodValue } from './PeriodPicker';

/**
 * Отчёт по рекламе Meta: кампании → группы объявлений → объявления.
 * Данные — Meta Marketing API (Insights): расход, показы, клики, лиды,
 * засчитанные Meta (включая конверсии, отправленные нашей платформой из CRM).
 * Каждая строка получает оценку эффективности относительно среднего CPL кабинета.
 */

const nf = new Intl.NumberFormat('ru-RU');

function money(v: number, cur: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: v < 100 ? 2 : 0,
    }).format(v);
  } catch {
    return `${nf.format(Math.round(v))} ${cur}`;
  }
}

/** Агрегат уровня (кампания/группа/объявление). */
interface Agg {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  children: Map<string, Agg>;
}

function newAgg(id: string, name: string): Agg {
  return { id, name, spend: 0, impressions: 0, clicks: 0, leads: 0, purchases: 0, children: new Map() };
}

function addRow(agg: Agg, r: MetaAdRow) {
  agg.spend += r.spend;
  agg.impressions += r.impressions;
  agg.clicks += r.clicks;
  agg.leads += r.leads;
  agg.purchases += r.purchases;
}

/** Собирает плоские строки объявлений в дерево кампаний. */
function buildTree(rows: MetaAdRow[]): Agg[] {
  const campaigns = new Map<string, Agg>();
  for (const r of rows) {
    const c = campaigns.get(r.campaignId) ?? newAgg(r.campaignId, r.campaignName);
    campaigns.set(r.campaignId, c);
    addRow(c, r);
    const s = c.children.get(r.adsetId) ?? newAgg(r.adsetId, r.adsetName);
    c.children.set(r.adsetId, s);
    addRow(s, r);
    const a = s.children.get(r.adId) ?? newAgg(r.adId, r.adName);
    s.children.set(r.adId, a);
    addRow(a, r);
  }
  const bySpend = (list: Agg[]) => list.sort((x, y) => y.spend - x.spend);
  const result = bySpend([...campaigns.values()]);
  for (const c of result) {
    for (const s of c.children.values()) {
      // Map сохраняет порядок вставки — пересобираем отсортированным
      const sortedAds = bySpend([...s.children.values()]);
      s.children = new Map(sortedAds.map((a) => [a.id, a]));
    }
    const sortedSets = bySpend([...c.children.values()]);
    c.children = new Map(sortedSets.map((s) => [s.id, s]));
  }
  return result;
}

type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'neutral';

const TONE_CLS: Record<Tone, string> = {
  good: 'bg-green-100 text-green-700',
  warn: 'bg-amber-100 text-amber-700',
  bad: 'bg-red-100 text-red-700',
  muted: 'bg-slate-100 text-slate-500',
  neutral: 'bg-slate-100 text-slate-600',
};

/**
 * Оценка эффективности строки против среднего CPL по кабинету:
 * заметно дешевле среднего — «Эффективно», дороже — «Дорогие лиды»,
 * расход без единого лида — «Расход без лидов».
 */
function verdict(a: Agg, avgCpl: number | null): { label: string; tone: Tone } {
  if (a.spend === 0 && a.leads === 0) return { label: 'Нет расхода', tone: 'muted' };
  if (a.leads === 0) return { label: 'Расход без лидов', tone: 'bad' };
  const cpl = a.spend / a.leads;
  if (avgCpl && cpl <= avgCpl * 0.8) return { label: 'Эффективно', tone: 'good' };
  if (avgCpl && cpl >= avgCpl * 1.3) return { label: 'Дорогие лиды', tone: 'warn' };
  return { label: 'В норме', tone: 'neutral' };
}

export default function MetaAdsSection({ period }: { period: PeriodValue }) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destId, setDestId] = useState('');
  const [data, setData] = useState<MetaAdsInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState<MetaAdsCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const metaDests = destinations.filter((d) => d.type === 'META');
  const selected = metaDests.find((d) => d.id === destId);
  const hasAccount = Boolean(selected?.config?.adAccountId);

  useEffect(() => {
    api<Destination[]>('/destinations')
      .then((list) => {
        setDestinations(list);
        const meta = list.filter((d) => d.type === 'META');
        // По умолчанию — первый кабинет с настроенной статистикой
        const preferred = meta.find((d) => d.config?.adAccountId) ?? meta[0];
        if (preferred) setDestId(preferred.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!destId || !hasAccount) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setCheck(null);
    const qs = new URLSearchParams({ ...periodParams(period), destinationId: destId });
    api<MetaAdsInsights>(`/ads/meta?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setExpanded(new Set());
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Не удалось загрузить статистику');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [destId, hasAccount, period]);

  const runCheck = async () => {
    if (!destId) return;
    setChecking(true);
    try {
      setCheck(await api<MetaAdsCheck>(`/ads/meta/check?destinationId=${destId}`));
    } catch (e) {
      setCheck({ ok: false, error: e instanceof Error ? e.message : 'Ошибка проверки' });
    } finally {
      setChecking(false);
    }
  };

  const tree = useMemo(() => buildTree(data?.rows ?? []), [data]);
  const totals = useMemo(() => {
    const t = newAgg('total', 'Итого');
    for (const r of data?.rows ?? []) addRow(t, r);
    return t;
  }, [data]);
  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const currency = data?.currency ?? 'USD';

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const cell = (a: Agg) => {
    const cpl = a.leads > 0 ? a.spend / a.leads : null;
    const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
    const v = verdict(a, avgCpl);
    return (
      <>
        <td className="px-2 py-2 text-right tabular-nums">{money(a.spend, currency)}</td>
        <td className="px-2 py-2 text-right tabular-nums font-medium">{nf.format(a.leads)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{cpl != null ? money(cpl, currency) : '—'}</td>
        <td className="px-2 py-2 text-right tabular-nums">{nf.format(a.clicks)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{ctr.toFixed(2)}%</td>
        <td className="px-2 py-2 text-right tabular-nums">{nf.format(a.impressions)}</td>
        <td className="px-2 py-2 text-right">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[v.tone]}`}>
            {v.label}
          </span>
        </td>
      </>
    );
  };

  if (metaDests.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Реклама Meta: кампании и объявления</h2>
          <p className="text-xs text-slate-500">
            Расход и лиды по данным Meta (включая конверсии, отправленные из CRM). Оценка — против
            среднего CPL кабинета{avgCpl != null ? `: ${money(avgCpl, currency)}` : ''}.
          </p>
        </div>
        {metaDests.length > 1 && (
          <div className="w-56">
            <Select value={destId} onChange={(e) => setDestId(e.target.value)}>
              {metaDests.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {!hasAccount && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Чтобы видеть кампании, укажите <b>ID рекламного кабинета</b>: «Направления» →{' '}
          {selected?.name ?? 'направление Meta'} → «Изменить» → поле «ID рекламного кабинета»
          (число из act_… в Ads Manager). Токен должен иметь право <code>ads_read</code>.
        </p>
      )}

      {hasAccount && error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <div className="mt-2 flex items-center gap-3">
            <Button variant="secondary" onClick={runCheck} disabled={checking}>
              {checking ? 'Проверяем…' : 'Проверить доступ к статистике'}
            </Button>
            {check && (
              <span className={check.ok ? 'text-green-700' : 'text-red-700'}>
                {check.ok
                  ? `Доступ есть: «${check.accountName}» (${check.currency}) — обновите страницу`
                  : check.error}
              </span>
            )}
          </div>
        </div>
      )}

      {hasAccount && !error && (
        <div className={loading && data ? 'opacity-60 transition-opacity' : ''}>
          {loading && !data && <p className="py-6 text-sm text-slate-400">Загружаем статистику из Meta…</p>}
          {data && data.rows.length === 0 && (
            <p className="py-4 text-sm text-slate-500">
              За выбранный период в кабинете не было активных объявлений.
            </p>
          )}
          {data && data.rows.length > 0 && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Расход', value: money(totals.spend, currency) },
                  { label: 'Лиды (по данным Meta)', value: nf.format(totals.leads) },
                  { label: 'Средний CPL', value: avgCpl != null ? money(avgCpl, currency) : '—' },
                  { label: 'Покупки', value: nf.format(totals.purchases) },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{t.label}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{t.value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="px-2 py-2">Кампания / группа / объявление</th>
                      <th className="px-2 py-2 text-right">Расход</th>
                      <th className="px-2 py-2 text-right">Лиды</th>
                      <th className="px-2 py-2 text-right">CPL</th>
                      <th className="px-2 py-2 text-right">Клики</th>
                      <th className="px-2 py-2 text-right">CTR</th>
                      <th className="px-2 py-2 text-right">Показы</th>
                      <th className="px-2 py-2 text-right">Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tree.map((c) => (
                      <FragmentRows
                        key={c.id}
                        campaign={c}
                        expanded={expanded}
                        toggle={toggle}
                        cell={cell}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Атрибуция Meta (окно 7 дней после клика) — цифры могут не совпадать один в один со
                сделками в CRM; данные за последние 1–3 дня ещё уточняются.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** Строки одной кампании: сама кампания + раскрытые группы и объявления. */
function FragmentRows({
  campaign,
  expanded,
  toggle,
  cell,
}: {
  campaign: Agg;
  expanded: Set<string>;
  toggle: (key: string) => void;
  cell: (a: Agg) => React.ReactNode;
}) {
  const cKey = `c:${campaign.id}`;
  const cOpen = expanded.has(cKey);
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-2 py-2 font-medium text-slate-900">
          <button onClick={() => toggle(cKey)} className="flex items-center gap-1.5 text-left">
            <span className="w-3 text-slate-400">{cOpen ? '▾' : '▸'}</span>
            {campaign.name}
          </button>
        </td>
        {cell(campaign)}
      </tr>
      {cOpen &&
        [...campaign.children.values()].map((adset) => {
          const sKey = `s:${campaign.id}:${adset.id}`;
          const sOpen = expanded.has(sKey);
          return (
            <FragmentAdset
              key={adset.id}
              adset={adset}
              sKey={sKey}
              open={sOpen}
              toggle={toggle}
              cell={cell}
            />
          );
        })}
    </>
  );
}

function FragmentAdset({
  adset,
  sKey,
  open,
  toggle,
  cell,
}: {
  adset: Agg;
  sKey: string;
  open: boolean;
  toggle: (key: string) => void;
  cell: (a: Agg) => React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-2 py-2 pl-7 text-slate-700">
          <button onClick={() => toggle(sKey)} className="flex items-center gap-1.5 text-left">
            <span className="w-3 text-slate-400">{open ? '▾' : '▸'}</span>
            {adset.name}
          </button>
        </td>
        {cell(adset)}
      </tr>
      {open &&
        [...adset.children.values()].map((ad) => (
          <tr key={ad.id} className="border-b border-slate-100 text-slate-600 hover:bg-slate-50">
            <td className="px-2 py-2 pl-14">{ad.name}</td>
            {cell(ad)}
          </tr>
        ))}
    </>
  );
}
