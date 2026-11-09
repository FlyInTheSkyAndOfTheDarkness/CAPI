import { BadRequestException, Injectable } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { createHash } from 'crypto';
import { Period } from '../logs/period';
import { friendlyError, GraphError, MetaInsightsService } from './meta-insights.service';

/**
 * Просмотр рекламного кабинета Meta в стиле Ads Manager (только чтение):
 * отчёт по уровню (кампании / группы / объявления) со статусами, бюджетами и
 * креативами, а также подневная разбивка для кабинета или выбранного объекта.
 *
 * Охват не суммируется между объектами, поэтому каждый уровень и итог
 * запрашиваются у Meta отдельно, а не складываются из объявлений.
 */

export type MetaLevel = 'campaign' | 'adset' | 'ad';
export const META_LEVELS: MetaLevel[] = ['campaign', 'adset', 'ad'];

const CACHE_TTL_MS = 10 * 60_000;
const MAX_PAGES = 10;
const PAGE_LIMIT = '200';

/** Статусы, которые показываем в списке объектов (без архива и удалённых). */
const VISIBLE_STATUSES = [
  'ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PENDING_REVIEW', 'DISAPPROVED',
  'PREAPPROVED', 'PENDING_BILLING_INFO', 'IN_PROCESS', 'WITH_ISSUES',
];

/** Валюты, у которых Meta отдаёт бюджеты без дробных единиц (смещение 1, а не 100). */
const ZERO_OFFSET_CURRENCIES = new Set([
  'CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND',
]);

export interface MetaMetrics {
  spend: number;
  impressions: number;
  reach: number;
  /** Показы на одного охваченного человека */
  frequency: number;
  clicks: number;
  linkClicks: number;
  /** CTR по кликам на ссылку, % */
  ctr: number;
  /** Цена клика по ссылке */
  cpc: number | null;
  /** Цена 1000 показов */
  cpm: number | null;
  leads: number;
  cpl: number | null;
  purchases: number;
}

export interface MetaCreative {
  thumbnailUrl: string | null;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  objectType: string | null;
}

export interface MetaReportRow extends MetaMetrics {
  id: string;
  name: string;
  /** effective_status Meta; DELETED_OR_ARCHIVED — объект есть в статистике, но не в списке */
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  /** У группы без своего бюджета — бюджет задан на кампании (Advantage+ / CBO) */
  budgetOnCampaign: boolean;
  creative: MetaCreative | null;
  previewUrl: string | null;
}

export interface MetaReport {
  level: MetaLevel;
  currency: string;
  accountName: string | null;
  timezone: string | null;
  period: { from: string; to: string };
  rows: MetaReportRow[];
  totals: MetaMetrics;
  fetchedAt: string;
}

export interface MetaDailyPoint extends MetaMetrics {
  date: string;
}

export interface MetaDaily {
  level: MetaLevel | 'account';
  id: string | null;
  currency: string;
  period: { from: string; to: string };
  days: MetaDailyPoint[];
  totals: MetaMetrics;
  fetchedAt: string;
}

export interface ReportFilter {
  campaignIds?: string[];
  adsetIds?: string[];
}

interface InsightsRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  spend?: string;
  account_currency?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface StructureRow {
  id: string;
  name?: string;
  effective_status?: string;
  objective?: string;
  campaign_id?: string;
  adset_id?: string;
  campaign?: { id?: string; name?: string };
  adset?: { id?: string; name?: string };
  daily_budget?: string;
  lifetime_budget?: string;
  preview_shareable_link?: string;
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    title?: string;
    body?: string;
    object_type?: string;
  };
}

const INSIGHT_FIELDS =
  'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,' +
  'impressions,reach,clicks,inline_link_clicks,spend,account_currency,actions';

const STRUCTURE_FIELDS: Record<MetaLevel, string> = {
  campaign: 'id,name,effective_status,objective,daily_budget,lifetime_budget',
  adset: 'id,name,effective_status,campaign_id,campaign{id,name},daily_budget,lifetime_budget',
  ad:
    'id,name,effective_status,campaign_id,adset_id,campaign{id,name},adset{id,name},' +
    'preview_shareable_link,' +
    'creative.thumbnail_width(192).thumbnail_height(192){thumbnail_url,image_url,title,body,object_type}',
};

const EDGE: Record<MetaLevel, string> = { campaign: 'campaigns', adset: 'adsets', ad: 'ads' };

/** Числовые ID Meta — защищают от подстановки произвольных значений в фильтры. */
export function parseIds(value?: string): string[] | undefined {
  if (!value) return undefined;
  const ids = value.split(',').map((s) => s.trim()).filter((s) => /^\d{1,30}$/.test(s));
  if (ids.length > 50) throw new BadRequestException('Слишком много объектов в фильтре (максимум 50).');
  return ids.length ? ids : undefined;
}

function num(v?: string): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Суммарные типы действий Meta; при их отсутствии — событийные пиксель + on-site. */
export function countActions(actions: InsightsRow['actions']): { leads: number; purchases: number } {
  const action = (type: string) => num(actions?.find((a) => a.action_type === type)?.value);
  return {
    leads:
      action('lead') ||
      action('offsite_conversion.fb_pixel_lead') + action('onsite_conversion.lead_grouped'),
    purchases:
      action('omni_purchase') ||
      action('offsite_conversion.fb_pixel_purchase') + action('onsite_conversion.purchase'),
  };
}

export function emptyMetrics(): MetaMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, linkClicks: 0,
    ctr: 0, cpc: null, cpm: null, leads: 0, cpl: null, purchases: 0,
  };
}

/** Метрики строки Insights; производные считаем сами — одинаково для строк и итогов. */
export function toMetrics(r?: InsightsRow): MetaMetrics {
  if (!r) return emptyMetrics();
  const { leads, purchases } = countActions(r.actions);
  return withDerived({
    ...emptyMetrics(),
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    linkClicks: num(r.inline_link_clicks),
    leads,
    purchases,
  });
}

function withDerived(m: MetaMetrics): MetaMetrics {
  return {
    ...m,
    frequency: m.reach > 0 ? m.impressions / m.reach : 0,
    ctr: m.impressions > 0 ? (m.linkClicks / m.impressions) * 100 : 0,
    cpc: m.linkClicks > 0 ? m.spend / m.linkClicks : null,
    cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
    cpl: m.leads > 0 ? m.spend / m.leads : null,
  };
}

/** Бюджет Meta в минимальных единицах → в валюте кабинета. */
export function budget(value: string | undefined, currency: string): number | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return null;
  return ZERO_OFFSET_CURRENCIES.has(currency.toUpperCase()) ? n : n / 100;
}

/** Все дни периода включительно — чтобы дни без показов были на графике нулями. */
export function periodDays(period: Period): string[] {
  const days: string[] = [];
  for (let t = period.since.getTime(); t < period.until.getTime(); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

@Injectable()
export class MetaReportService {
  private readonly cache = new Map<string, { at: number; data: unknown }>();

  constructor(private readonly insights: MetaInsightsService) {}

  private account(destination: Destination): string {
    const id = this.insights.adAccountId(destination);
    if (!id) {
      throw new BadRequestException(
        'В направлении не указан ID рекламного кабинета. Откройте направление → «Изменить» и вставьте ID из Ads Manager (act_…).',
      );
    }
    return id;
  }

  /** GET к Graph API со всеми страницами и кэшем; ключ включает отпечаток токена. */
  private async graph<T>(
    destination: Destination,
    path: string,
    params: Record<string, string>,
    opts: { paged: boolean },
  ): Promise<T[]> {
    const credential = createHash('sha256')
      .update(destination.adsAccessToken || destination.accessToken)
      .digest('hex');
    const query = new URLSearchParams(params);
    const cacheKey = `${destination.id}:${credential}:${path}?${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data as T[];

    query.set('access_token', this.insights.statsToken(destination));
    let url: string | null = `${this.insights.apiBase(destination)}/${path}?${query}`;
    const out: T[] = [];
    for (let page = 0; url && page < MAX_PAGES; page++) {
      let json: { data?: T[]; paging?: { next?: string }; error?: GraphError } & Record<string, unknown>;
      try {
        const res: Response = await fetch(url);
        json = (await res.json()) as typeof json;
      } catch (e) {
        throw new BadRequestException(
          `Meta API недоступен: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (json.error) throw new BadRequestException(friendlyError(json.error));
      if (!opts.paged) {
        out.push(json as unknown as T);
        break;
      }
      out.push(...(json.data ?? []));
      url = json.paging?.next ?? null;
    }
    this.cache.set(cacheKey, { at: Date.now(), data: out });
    return out;
  }

  private filtering(filter: ReportFilter, extra: object[] = []): string | undefined {
    const rules: object[] = [...extra];
    if (filter.campaignIds?.length) {
      rules.push({ field: 'campaign.id', operator: 'IN', value: filter.campaignIds });
    }
    if (filter.adsetIds?.length) {
      rules.push({ field: 'adset.id', operator: 'IN', value: filter.adsetIds });
    }
    return rules.length ? JSON.stringify(rules) : undefined;
  }

  private insightParams(period: Period, level: string, filter: ReportFilter, extra: Record<string, string> = {}) {
    const params: Record<string, string> = {
      level,
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since: period.from, until: period.to }),
      limit: PAGE_LIMIT,
      ...extra,
    };
    const filtering = this.filtering(filter);
    if (filtering) params.filtering = filtering;
    return params;
  }

  private accountInfo(destination: Destination, accountId: string) {
    return this.graph<{ name?: string; currency?: string; timezone_name?: string }>(
      destination,
      `act_${accountId}`,
      { fields: 'name,currency,timezone_name' },
      { paged: false },
    ).then((r) => r[0] ?? {});
  }

  /** Таблица уровня: все видимые объекты + их статистика за период. */
  async report(
    destination: Destination,
    level: MetaLevel,
    period: Period,
    filter: ReportFilter = {},
  ): Promise<MetaReport> {
    const accountId = this.account(destination);
    const act = `act_${accountId}`;
    const structureParams: Record<string, string> = {
      fields: STRUCTURE_FIELDS[level],
      limit: PAGE_LIMIT,
    };
    const structureFilter = this.filtering(filter, [
      { field: 'effective_status', operator: 'IN', value: VISIBLE_STATUSES },
    ]);
    if (structureFilter) structureParams.filtering = structureFilter;

    const [account, structure, stats, totalRows] = await Promise.all([
      this.accountInfo(destination, accountId),
      this.graph<StructureRow>(destination, `${act}/${EDGE[level]}`, structureParams, { paged: true }),
      this.graph<InsightsRow>(destination, `${act}/insights`, this.insightParams(period, level, filter), { paged: true }),
      this.graph<InsightsRow>(destination, `${act}/insights`, this.insightParams(period, 'account', filter), { paged: true }),
    ]);

    const currency = account.currency ?? stats[0]?.account_currency ?? 'USD';
    const idOf = (r: InsightsRow) =>
      (level === 'campaign' ? r.campaign_id : level === 'adset' ? r.adset_id : r.ad_id) ?? '';
    const statsById = new Map(stats.map((r) => [idOf(r), r]));

    const rows: MetaReportRow[] = structure.map((s) => {
      const st = statsById.get(s.id);
      statsById.delete(s.id);
      const daily = budget(s.daily_budget, currency);
      const lifetime = budget(s.lifetime_budget, currency);
      return {
        ...toMetrics(st),
        id: s.id,
        name: s.name ?? s.id,
        status: s.effective_status ?? 'UNKNOWN',
        campaignId: level === 'campaign' ? s.id : (s.campaign?.id ?? s.campaign_id ?? null),
        campaignName: level === 'campaign' ? (s.name ?? null) : (s.campaign?.name ?? st?.campaign_name ?? null),
        adsetId: level === 'ad' ? (s.adset?.id ?? s.adset_id ?? null) : level === 'adset' ? s.id : null,
        adsetName: level === 'ad' ? (s.adset?.name ?? st?.adset_name ?? null) : level === 'adset' ? (s.name ?? null) : null,
        objective: s.objective ?? null,
        dailyBudget: level === 'ad' ? null : daily,
        lifetimeBudget: level === 'ad' ? null : lifetime,
        budgetOnCampaign: level === 'adset' && daily == null && lifetime == null,
        creative: s.creative
          ? {
              thumbnailUrl: s.creative.thumbnail_url ?? null,
              imageUrl: s.creative.image_url ?? null,
              title: s.creative.title ?? null,
              body: s.creative.body ?? null,
              objectType: s.creative.object_type ?? null,
            }
          : null,
        previewUrl: s.preview_shareable_link ?? null,
      };
    });

    // Объекты со статистикой, но в архиве/удалённые — показываем, чтобы итог сходился.
    for (const [id, st] of statsById) {
      rows.push({
        ...toMetrics(st),
        id,
        name:
          (level === 'campaign' ? st.campaign_name : level === 'adset' ? st.adset_name : st.ad_name) ?? id,
        status: 'DELETED_OR_ARCHIVED',
        campaignId: st.campaign_id ?? null,
        campaignName: st.campaign_name ?? null,
        adsetId: level === 'campaign' ? null : (st.adset_id ?? null),
        adsetName: level === 'campaign' ? null : (st.adset_name ?? null),
        objective: null,
        dailyBudget: null,
        lifetimeBudget: null,
        budgetOnCampaign: false,
        creative: null,
        previewUrl: null,
      });
    }

    rows.sort((a, b) => b.spend - a.spend || b.impressions - a.impressions || a.name.localeCompare(b.name));

    return {
      level,
      currency,
      accountName: account.name ?? null,
      timezone: account.timezone_name ?? null,
      period: { from: period.from, to: period.to },
      rows,
      totals: toMetrics(totalRows[0]),
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Подневная статистика кабинета (без id) или одного объекта уровня. */
  async daily(
    destination: Destination,
    period: Period,
    target?: { level: MetaLevel; id: string },
  ): Promise<MetaDaily> {
    const accountId = this.account(destination);
    const act = `act_${accountId}`;
    const filtering: Record<string, string> = target
      ? { filtering: JSON.stringify([{ field: `${target.level}.id`, operator: 'EQUAL', value: target.id }]) }
      : {};
    const params = { ...this.insightParams(period, 'account', {}, { time_increment: '1' }), ...filtering };
    const totalParams = { ...this.insightParams(period, 'account', {}), ...filtering };

    const [account, rows, totalRows] = await Promise.all([
      this.accountInfo(destination, accountId),
      this.graph<InsightsRow>(destination, `${act}/insights`, params, { paged: true }),
      this.graph<InsightsRow>(destination, `${act}/insights`, totalParams, { paged: true }),
    ]);

    const byDate = new Map(rows.map((r) => [r.date_start ?? '', r]));
    return {
      level: target?.level ?? 'account',
      id: target?.id ?? null,
      currency: account.currency ?? rows[0]?.account_currency ?? 'USD',
      period: { from: period.from, to: period.to },
      days: periodDays(period).map((date) => ({ date, ...toMetrics(byDate.get(date)) })),
      totals: toMetrics(totalRows[0]),
      fetchedAt: new Date().toISOString(),
    };
  }
}
