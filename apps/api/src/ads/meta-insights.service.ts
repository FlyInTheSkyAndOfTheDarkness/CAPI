import { BadRequestException, Injectable } from '@nestjs/common';
import { Destination } from '@prisma/client';
import { createHash } from 'crypto';
import { CryptoService } from '../common/crypto.service';
import { Period } from '../logs/period';

const DEFAULT_GRAPH_API_VERSION = 'v26.0';
/** Кэш ответов Insights: Meta жёстко лимитирует частоту запросов к кабинету. */
const CACHE_TTL_MS = 10 * 60_000;
/** Потолок пагинации — защита от кабинетов с тысячами объявлений. */
const MAX_PAGES = 10;

/** Строка статистики на уровне объявления (родители агрегируются на фронте). */
export interface MetaAdRow {
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** CTR в процентах, как отдаёт Meta */
  ctr: number;
  /** Лиды, засчитанные Meta этому объявлению (включая наши CRM-события) */
  leads: number;
  purchases: number;
}

export interface MetaInsightsResult {
  currency: string;
  rows: MetaAdRow[];
  period: { from: string; to: string };
  /** Момент фактического запроса к Meta — ответ мог прийти из кэша */
  fetchedAt: string;
}

interface GraphError {
  message?: string;
  code?: number;
  error_subcode?: number;
}

interface InsightsApiRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  account_currency?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

/** Человекочитаемая расшифровка типовых ошибок Graph API. */
function friendlyError(err: GraphError): string {
  const m = (err.message ?? '').toLowerCase();
  if (err.code === 190) {
    return 'Токен недействителен или истёк. Перевыпустите токен системного пользователя в Business Manager.';
  }
  if (err.code === 17 || err.code === 613 || err.code === 80000 || err.code === 80004) {
    return 'Meta ограничила частоту запросов к кабинету — повторите через пару минут.';
  }
  if (m.includes('ads_read') || m.includes('permission') || err.code === 200 || err.code === 10) {
    return 'У токена нет права ads_read или доступа к этому рекламному кабинету. Выпустите токен системного пользователя с правом ads_read и назначьте ему кабинет.';
  }
  if (err.code === 100 && (m.includes('unsupported get request') || m.includes('does not exist'))) {
    return 'Рекламный кабинет не найден — проверьте ID (число из act_… в Ads Manager).';
  }
  return `Meta API: ${err.message ?? 'неизвестная ошибка'}`;
}

@Injectable()
export class MetaInsightsService {
  private readonly cache = new Map<string, { at: number; data: MetaInsightsResult }>();

  constructor(private readonly crypto: CryptoService) {}

  /** ID кабинета из настроек направления: принимает и `act_123`, и `123`. */
  adAccountId(destination: Destination): string | null {
    const config = (destination.config ?? {}) as { adAccountId?: string };
    const digits = String(config.adAccountId ?? '').replace(/^act_/i, '').replace(/\D/g, '');
    return digits || null;
  }

  private apiBase(destination: Destination): string {
    const config = (destination.config ?? {}) as { apiVersion?: string };
    const version =
      config.apiVersion ?? process.env.META_GRAPH_API_VERSION ?? DEFAULT_GRAPH_API_VERSION;
    // Переопределение хоста — для интеграционных тестов на заглушке
    const host = process.env.META_GRAPH_API_BASE ?? 'https://graph.facebook.com';
    return `${host}/${version}`;
  }

  private statsToken(destination: Destination): string {
    return this.crypto.decrypt(destination.adsAccessToken || destination.accessToken) ?? '';
  }

  /**
   * Проверка доступа к статистике: имя кабинета + пробный запрос Insights.
   * Не бросает исключений — возвращает диагностику для показа в UI.
   */
  async check(destination: Destination): Promise<{
    ok: boolean;
    accountName?: string;
    currency?: string;
    error?: string;
  }> {
    const accountId = this.adAccountId(destination);
    if (!accountId) {
      return { ok: false, error: 'В направлении не указан ID рекламного кабинета (act_…).' };
    }
    const token = this.statsToken(destination);
    try {
      const res = await fetch(
        `${this.apiBase(destination)}/act_${accountId}` +
          `?fields=name,currency&access_token=${encodeURIComponent(token)}`,
      );
      const json = (await res.json()) as {
        name?: string;
        currency?: string;
        error?: GraphError;
      };
      if (json.error) return { ok: false, error: friendlyError(json.error) };

      // Пробный запрос статистики — право на кабинет и на insights могут различаться
      const probe = await fetch(
        `${this.apiBase(destination)}/act_${accountId}/insights` +
          `?level=campaign&fields=campaign_name&date_preset=last_30d&limit=1` +
          `&access_token=${encodeURIComponent(token)}`,
      );
      const probeJson = (await probe.json()) as { error?: GraphError };
      if (probeJson.error) return { ok: false, error: friendlyError(probeJson.error) };

      return { ok: true, accountName: json.name, currency: json.currency };
    } catch (e) {
      return { ok: false, error: `Сеть недоступна: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /** Статистика кабинета на уровне объявлений за период (с кэшем 10 минут). */
  async insights(destination: Destination, period: Period): Promise<MetaInsightsResult> {
    const accountId = this.adAccountId(destination);
    if (!accountId) {
      throw new BadRequestException(
        'В направлении не указан ID рекламного кабинета. Откройте направление → «Изменить» и вставьте ID из Ads Manager (act_…).',
      );
    }

    // После замены/удаления токена проверяем новые права, не возвращая старый кэш.
    const credentialKey = createHash('sha256')
      .update(destination.adsAccessToken || destination.accessToken).digest('hex');
    const cacheKey = `${destination.id}:${accountId}:${credentialKey}:${period.from}:${period.to}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.data;
    }

    const token = this.statsToken(destination);
    const params = new URLSearchParams({
      level: 'ad',
      fields:
        'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,' +
        'impressions,clicks,spend,ctr,account_currency,actions',
      time_range: JSON.stringify({ since: period.from, until: period.to }),
      limit: '200',
      access_token: token,
    });

    let url: string | null = `${this.apiBase(destination)}/act_${accountId}/insights?${params}`;
    const rows: MetaAdRow[] = [];
    let currency = 'USD';

    for (let page = 0; url && page < MAX_PAGES; page++) {
      const res: Response = await fetch(url);
      const json = (await res.json()) as {
        data?: InsightsApiRow[];
        paging?: { next?: string };
        error?: GraphError;
      };
      if (json.error) {
        throw new BadRequestException(friendlyError(json.error));
      }
      for (const r of json.data ?? []) {
        // Суммарные типы действий Meta: lead — все лиды, omni_purchase — все покупки.
        // Если суммарного нет — складываем событийные (пиксель + on-site).
        const action = (type: string) =>
          Number(r.actions?.find((a) => a.action_type === type)?.value ?? 0);
        const leads =
          action('lead') ||
          action('offsite_conversion.fb_pixel_lead') + action('onsite_conversion.lead_grouped');
        const purchases =
          action('omni_purchase') ||
          action('offsite_conversion.fb_pixel_purchase') + action('onsite_conversion.purchase');
        if (r.account_currency) currency = r.account_currency;
        rows.push({
          campaignId: r.campaign_id ?? '',
          campaignName: r.campaign_name ?? r.campaign_id ?? '—',
          adsetId: r.adset_id ?? '',
          adsetName: r.adset_name ?? r.adset_id ?? '—',
          adId: r.ad_id ?? '',
          adName: r.ad_name ?? r.ad_id ?? '—',
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          ctr: Number(r.ctr ?? 0),
          leads,
          purchases,
        });
      }
      url = json.paging?.next ?? null;
    }

    const data: MetaInsightsResult = {
      currency,
      rows,
      period: { from: period.from, to: period.to },
      fetchedAt: new Date().toISOString(),
    };
    this.cache.set(cacheKey, { at: Date.now(), data });
    return data;
  }
}
