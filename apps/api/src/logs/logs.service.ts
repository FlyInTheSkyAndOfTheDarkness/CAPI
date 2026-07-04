import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AnalyticsFilters {
  connectionId?: string;
  destinationId?: string;
  eventName?: string;
}

type StatusKey = 'sent' | 'failed' | 'pending' | 'skipped';
const STATUS_KEY: Record<string, StatusKey> = {
  SENT: 'sent',
  FAILED: 'failed',
  PENDING: 'pending',
  SKIPPED: 'skipped',
};

/** Порядок событий для «воронки» — известные ставим по стадии, прочие по объёму. */
const FUNNEL_ORDER = [
  'ViewContent',
  'Contact',
  'Lead',
  'SubmitForm',
  'CompleteRegistration',
  'Schedule',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
  'CompletePayment',
];

/** Классификация текста ошибки в понятную категорию с подсказкой как чинить. */
export function categorizeError(message: string): { category: string; hint: string } {
  const m = message.toLowerCase();
  if (m.includes('нет данных о клиенте')) {
    return {
      category: 'Нет email/телефона у контакта',
      hint: 'В карточке CRM у контакта не заполнены email и телефон — без них платформа не сматчит конверсию.',
    };
  }
  if (m.includes('cannot parse access token') || m.includes('invalid oauth') || m.includes('oauth access token')) {
    return {
      category: 'Неверный или истёкший токен направления',
      hint: 'Перевыпустите access token пикселя в Events Manager и обновите направление.',
    };
  }
  if (m.includes('обновить токен') || m.includes('не авторизовано')) {
    return {
      category: 'Токен amoCRM недействителен',
      hint: 'Переподключите amoCRM через OAuth — refresh-токен истёк или был отозван.',
    };
  }
  if (m.includes('tiktok')) {
    return {
      category: 'Отклонено TikTok',
      hint: 'Проверьте Event Source ID (CRM Event Set) и access token в TikTok Events Manager.',
    };
  }
  if (m.includes('meta capi') || m.includes('graph.facebook')) {
    return {
      category: 'Отклонено Meta',
      hint: 'Проверьте Pixel ID, права токена и корректность события в Events Manager.',
    };
  }
  if (/http 4\d\d/.test(m)) {
    return {
      category: 'Отклонено платформой (4xx)',
      hint: 'Платформа отклонила запрос — проверьте креды и параметры направления.',
    };
  }
  if (/http 5\d\d/.test(m) || m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return {
      category: 'Сеть или недоступность платформы',
      hint: 'Временная ошибка сети/платформы — доставка повторится автоматически.',
    };
  }
  return { category: 'Прочая ошибка', hint: 'Откройте лог доставки для деталей.' };
}

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  private sinceUtc(days: number): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
    );
  }

  private clampDays(days?: string): number {
    return Math.min(Math.max(Number(days) || 7, 1), 90);
  }

  private where(
    workspaceId: string,
    since: Date,
    f: AnalyticsFilters,
  ): Prisma.DeliveryLogWhereInput {
    return {
      workspaceId,
      createdAt: { gte: since },
      ...(f.connectionId ? { connectionId: f.connectionId } : {}),
      ...(f.destinationId ? { destinationId: f.destinationId } : {}),
      ...(f.eventName ? { eventName: f.eventName } : {}),
    };
  }

  private whereBetween(
    workspaceId: string,
    gte: Date,
    lt: Date,
    f: AnalyticsFilters,
  ): Prisma.DeliveryLogWhereInput {
    return {
      workspaceId,
      createdAt: { gte, lt },
      ...(f.connectionId ? { connectionId: f.connectionId } : {}),
      ...(f.destinationId ? { destinationId: f.destinationId } : {}),
      ...(f.eventName ? { eventName: f.eventName } : {}),
    };
  }

  /** SQL-фрагмент фильтров для raw-запросов. */
  private filterSql(f: AnalyticsFilters): Prisma.Sql {
    return Prisma.sql`
      ${f.connectionId ? Prisma.sql`AND "connectionId" = ${f.connectionId}` : Prisma.empty}
      ${f.destinationId ? Prisma.sql`AND "destinationId" = ${f.destinationId}` : Prisma.empty}
      ${f.eventName ? Prisma.sql`AND "eventName" = ${f.eventName}` : Prisma.empty}
    `;
  }

  async stats(workspaceId: string, days: string | undefined, f: AnalyticsFilters) {
    const numDays = this.clampDays(days);
    const since = this.sinceUtc(numDays);
    const where = this.where(workspaceId, since, f);

    const grouped = await this.prisma.deliveryLog.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const raw = await this.prisma.$queryRaw<Array<{ day: string; status: string; count: number }>>`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             "status"::text AS status,
             COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId}
        AND "createdAt" >= ${since}
        ${f.connectionId ? Prisma.sql`AND "connectionId" = ${f.connectionId}` : Prisma.empty}
        ${f.destinationId ? Prisma.sql`AND "destinationId" = ${f.destinationId}` : Prisma.empty}
        ${f.eventName ? Prisma.sql`AND "eventName" = ${f.eventName}` : Prisma.empty}
      GROUP BY 1, 2
    `;

    const counts: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;

    const byDay = new Map<string, Record<StatusKey, number>>();
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since.getTime() + i * 86_400_000);
      byDay.set(d.toISOString().slice(0, 10), { sent: 0, failed: 0, pending: 0, skipped: 0 });
    }
    for (const row of raw) {
      const bucket = byDay.get(row.day);
      const key = STATUS_KEY[row.status];
      if (bucket && key) bucket[key] = row.count;
    }

    const finished = counts.SENT + counts.FAILED;
    const successRate = finished > 0 ? counts.SENT / finished : null;

    const [connections, destinations, mappings] = await Promise.all([
      this.prisma.crmConnection.count({ where: { workspaceId } }),
      this.prisma.destination.count({ where: { workspaceId } }),
      this.prisma.eventMapping.count({ where: { workspaceId, isActive: true } }),
    ]);

    return {
      period: `${numDays}d`,
      deliveries: counts,
      successRate,
      connections,
      destinations,
      mappings,
      days: [...byDay.entries()].map(([date, values]) => ({ date, ...values })),
    };
  }

  async breakdown(
    workspaceId: string,
    days: string | undefined,
    by: 'destination' | 'connection' | 'event' | 'mapping',
    f: AnalyticsFilters,
  ) {
    const since = this.sinceUtc(this.clampDays(days));
    const where = this.where(workspaceId, since, f);
    const field: Prisma.DeliveryLogScalarFieldEnum =
      by === 'destination'
        ? 'destinationId'
        : by === 'connection'
          ? 'connectionId'
          : by === 'mapping'
            ? 'mappingId'
            : 'eventName';

    const rows = await this.prisma.deliveryLog.groupBy({
      by: [field, 'status'],
      where,
      _count: { _all: true },
    });

    const agg = new Map<string, Record<StatusKey, number>>();
    for (const r of rows) {
      const k = (r as Record<string, unknown>)[field];
      const key = k == null ? '—' : String(k);
      const bucket = agg.get(key) ?? { sent: 0, failed: 0, pending: 0, skipped: 0 };
      const sk = STATUS_KEY[r.status];
      if (sk) bucket[sk] += r._count._all;
      agg.set(key, bucket);
    }

    let labels = new Map<string, string>();
    if (by === 'destination') {
      const ds = await this.prisma.destination.findMany({
        where: { workspaceId },
        select: { id: true, name: true, type: true },
      });
      const typeLabel: Record<string, string> = {
        META: 'Meta',
        TIKTOK: 'TikTok',
        GOOGLE_ADS: 'Google Ads',
        YANDEX: 'Яндекс',
      };
      labels = new Map(ds.map((d) => [d.id, `${d.name} · ${typeLabel[d.type] ?? d.type}`]));
    } else if (by === 'connection') {
      const cs = await this.prisma.crmConnection.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
      });
      labels = new Map(cs.map((c) => [c.id, c.name]));
    } else if (by === 'mapping') {
      const ms = await this.prisma.eventMapping.findMany({
        where: { workspaceId },
        select: {
          id: true,
          eventName: true,
          statusName: true,
          statusId: true,
          connection: { select: { name: true } },
        },
      });
      labels = new Map(
        ms.map((m) => [
          m.id,
          `${m.connection.name}: ${m.statusName ?? m.statusId} → ${m.eventName}`,
        ]),
      );
    }

    return [...agg.entries()]
      .map(([key, b]) => {
        const total = b.sent + b.failed + b.pending + b.skipped;
        const finished = b.sent + b.failed;
        return {
          key,
          label: by === 'event' ? key : (labels.get(key) ?? 'Удалено'),
          ...b,
          total,
          successRate: finished > 0 ? b.sent / finished : null,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  async errors(workspaceId: string, days: string | undefined, f: AnalyticsFilters) {
    const since = this.sinceUtc(this.clampDays(days));
    const logs = await this.prisma.deliveryLog.findMany({
      where: { ...this.where(workspaceId, since, f), status: 'FAILED', error: { not: null } },
      select: { error: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const map = new Map<
      string,
      { category: string; hint: string; count: number; lastSeen: Date; sample: string }
    >();
    for (const l of logs) {
      const { category, hint } = categorizeError(l.error ?? '');
      const e = map.get(category) ?? {
        category,
        hint,
        count: 0,
        lastSeen: l.createdAt,
        sample: l.error ?? '',
      };
      e.count += 1;
      if (l.createdAt > e.lastSeen) e.lastSeen = l.createdAt;
      map.set(category, e);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  async funnel(workspaceId: string, days: string | undefined, f: AnalyticsFilters) {
    const since = this.sinceUtc(this.clampDays(days));
    const rows = await this.prisma.deliveryLog.groupBy({
      by: ['eventName', 'status'],
      where: this.where(workspaceId, since, f),
      _count: { _all: true },
    });
    const agg = new Map<string, { sent: number; total: number }>();
    for (const r of rows) {
      const e = agg.get(r.eventName) ?? { sent: 0, total: 0 };
      e.total += r._count._all;
      if (r.status === 'SENT') e.sent += r._count._all;
      agg.set(r.eventName, e);
    }
    return [...agg.entries()]
      .map(([eventName, v]) => ({ eventName, ...v }))
      .sort((a, b) => {
        const ai = FUNNEL_ORDER.indexOf(a.eventName);
        const bi = FUNNEL_ORDER.indexOf(b.eventName);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return b.sent - a.sent;
      });
  }

  /** Детальная аналитика для отдельной страницы: тренд, задержка, надёжность,
   *  качество матчинга, выручка, тепловая карта, разрезы и сравнение периодов. */
  async analytics(workspaceId: string, days: string | undefined, f: AnalyticsFilters) {
    const numDays = this.clampDays(days);
    const since = this.sinceUtc(numDays);
    const prevSince = new Date(since.getTime() - numDays * 86_400_000);
    const ff = this.filterSql(f);

    const toCounts = (grouped: Array<{ status: string; _count: { _all: number } }>) => {
      const c = { SENT: 0, FAILED: 0, PENDING: 0, SKIPPED: 0 } as Record<string, number>;
      for (const g of grouped) c[g.status] = g._count._all;
      return c;
    };

    const [curGrouped, prevGrouped] = await Promise.all([
      this.prisma.deliveryLog.groupBy({
        by: ['status'],
        where: this.where(workspaceId, since, f),
        _count: { _all: true },
      }),
      this.prisma.deliveryLog.groupBy({
        by: ['status'],
        where: this.whereBetween(workspaceId, prevSince, since, f),
        _count: { _all: true },
      }),
    ]);
    const cur = toCounts(curGrouped);
    const prev = toCounts(prevGrouped);
    const sr = (c: Record<string, number>) =>
      c.SENT + c.FAILED > 0 ? c.SENT / (c.SENT + c.FAILED) : null;
    const total = (c: Record<string, number>) => c.SENT + c.FAILED + c.PENDING + c.SKIPPED;

    // Подневный тренд success rate
    const trendRaw = await this.prisma.$queryRaw<Array<{ day: string; status: string; count: number }>>`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             "status"::text AS status, COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since} ${ff}
      GROUP BY 1, 2
    `;
    const trendMap = new Map<string, { sent: number; failed: number }>();
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since.getTime() + i * 86_400_000);
      trendMap.set(d.toISOString().slice(0, 10), { sent: 0, failed: 0 });
    }
    for (const r of trendRaw) {
      const b = trendMap.get(r.day);
      if (b && r.status === 'SENT') b.sent = r.count;
      if (b && r.status === 'FAILED') b.failed = r.count;
    }
    const successTrend = [...trendMap.entries()].map(([date, v]) => ({
      date,
      sent: v.sent,
      failed: v.failed,
      successRate: v.sent + v.failed > 0 ? v.sent / (v.sent + v.failed) : null,
    }));

    // Задержка доставки (createdAt → sentAt), секунды
    const latRows = await this.prisma.$queryRaw<
      Array<{ avg: number; median: number; p90: number; count: number }>
    >`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM ("sentAt" - "createdAt"))), 0)::float AS avg,
             COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "createdAt"))), 0)::float AS median,
             COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "createdAt"))), 0)::float AS p90,
             COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since}
        AND status = 'SENT' AND "sentAt" IS NOT NULL ${ff}
    `;
    const latency = latRows[0] ?? { avg: 0, median: 0, p90: 0, count: 0 };

    // Надёжность: с первой попытки / с ретраем / провалено
    const relRows = await this.prisma.$queryRaw<
      Array<{ first_try: number; retried: number; failed: number }>
    >`
      SELECT COUNT(*) FILTER (WHERE status = 'SENT' AND attempts <= 1)::int AS first_try,
             COUNT(*) FILTER (WHERE status = 'SENT' AND attempts > 1)::int AS retried,
             COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since} ${ff}
    `;
    const reliability = relRows[0] ?? { first_try: 0, retried: 0, failed: 0 };

    // Качество матчинга: покрытие идентификаторов
    const mqRows = await this.prisma.$queryRaw<
      Array<{
        total: number;
        email: number;
        phone: number;
        external_id: number;
        click_id: number;
        none: number;
      }>
    >`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE "hasEmail")::int AS email,
             COUNT(*) FILTER (WHERE "hasPhone")::int AS phone,
             COUNT(*) FILTER (WHERE "hasExternalId")::int AS external_id,
             COUNT(*) FILTER (WHERE "hasClickId")::int AS click_id,
             COUNT(*) FILTER (WHERE NOT "hasEmail" AND NOT "hasPhone" AND NOT "hasExternalId" AND NOT "hasClickId")::int AS none
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since} ${ff}
    `;
    const matchQuality =
      mqRows[0] ?? { total: 0, email: 0, phone: 0, external_id: 0, click_id: 0, none: 0 };

    // Выручка по валютам (по успешно отправленным)
    const valueByCurrency = await this.prisma.$queryRaw<
      Array<{ currency: string; total: number; count: number }>
    >`
      SELECT COALESCE("valueCurrency", 'RUB') AS currency,
             COALESCE(SUM("value"), 0)::float AS total,
             COUNT("value")::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since}
        AND "value" IS NOT NULL AND status = 'SENT' ${ff}
      GROUP BY 1 ORDER BY 2 DESC
    `;

    // Тепловая карта: ISO день недели (1=Пн..7=Вс) × час (UTC)
    const heatmap = await this.prisma.$queryRaw<Array<{ dow: number; hour: number; count: number }>>`
      SELECT EXTRACT(ISODOW FROM "createdAt" AT TIME ZONE 'UTC')::int AS dow,
             EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'UTC')::int AS hour,
             COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since} ${ff}
      GROUP BY 1, 2
    `;

    const [byConnection, byMapping] = await Promise.all([
      this.breakdown(workspaceId, days, 'connection', f),
      this.breakdown(workspaceId, days, 'mapping', f),
    ]);

    return {
      period: { days: numDays },
      overview: {
        total: total(cur),
        sent: cur.SENT,
        failed: cur.FAILED,
        pending: cur.PENDING,
        skipped: cur.SKIPPED,
        successRate: sr(cur),
        prev: { total: total(prev), sent: prev.SENT, successRate: sr(prev) },
      },
      successTrend,
      latency,
      reliability,
      matchQuality,
      value: {
        total: valueByCurrency.reduce((s, r) => s + r.total, 0),
        count: valueByCurrency.reduce((s, r) => s + r.count, 0),
        byCurrency: valueByCurrency,
      },
      heatmap,
      byConnection,
      byMapping,
    };
  }

  /**
   * Советник по эффективности таргета: health-score (0-100) и приоритизированные
   * рекомендации, как улучшить матчинг и снизить цену за конверсию (CPA/CPM).
   */
  async advisor(workspaceId: string) {
    const days = 14;
    const since = this.sinceUtc(days);
    const [analytics, errors, brokenConnections, activeMappings, valueMappings] = await Promise.all([
      this.analytics(workspaceId, String(days), {}),
      this.errors(workspaceId, String(days), {}),
      this.prisma.crmConnection.findMany({
        where: { workspaceId, status: 'ERROR' },
        select: { name: true },
      }),
      this.prisma.eventMapping.count({ where: { workspaceId, isActive: true } }),
      this.prisma.eventMapping.count({ where: { workspaceId, isActive: true, sendValue: true } }),
    ]);

    const mq = analytics.matchQuality;
    const ov = analytics.overview;
    const total = mq.total;
    const pct = (n: number) => (total > 0 ? n / total : 0);

    type Rec = {
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      detail: string;
      metric?: string;
    };
    const recs: Rec[] = [];

    // Нет данных — сетап
    if (total === 0) {
      recs.push({
        severity: activeMappings === 0 ? 'high' : 'medium',
        title: 'Пока нет отправленных конверсий',
        detail:
          activeMappings === 0
            ? 'Настройте подключение CRM, направление (пиксель) и маппинг этапа воронки на событие — тогда конверсии начнут уходить.'
            : 'Маппинги есть, но событий ещё не поступало. Переведите тестовую сделку на нужный этап и проверьте «Логи доставки».',
      });
    }

    // Сломанные подключения (критично — конверсии не отправляются)
    for (const c of brokenConnections) {
      recs.push({
        severity: 'critical',
        title: `Подключение «${c.name}» в ошибке`,
        detail:
          'Токен недействителен или нет доступа к CRM — конверсии не отправляются. Переподключите CRM (OAuth) и запустите «Диагностику».',
      });
    }

    if (total > 0) {
      const clickIdShare = pct(mq.click_id);
      const noneShare = pct(mq.none);
      const emailShare = pct(mq.email);
      const phoneShare = pct(mq.phone);

      // Click-id — сильнейший рычаг CPA
      if (clickIdShare < 0.3) {
        recs.push({
          severity: 'high',
          title: 'Мало click-id — матчинг слабый, CPA выше',
          detail:
            'Click-id (fbclid/gclid/ttclid) — самый сильный сигнал сопоставления конверсии с кликом по рекламе. Настройте передачу click-id из формы сайта в поле CRM (или укажите поле в маппинге). Это заметно снижает цену за конверсию.',
          metric: `click-id есть у ${Math.round(clickIdShare * 100)}% конверсий`,
        });
      }

      // Конверсии без идентификаторов вовсе
      if (noneShare > 0.1) {
        recs.push({
          severity: noneShare > 0.3 ? 'high' : 'medium',
          title: 'Конверсии без идентификаторов не матчатся',
          detail:
            'У части конверсий нет ни email/телефона, ни click-id — платформа почти не сможет их сопоставить, бюджет тратится впустую. Проверьте, что форма сайта заполняет контакт и передаёт click-id в CRM.',
          metric: `${Math.round(noneShare * 100)}% без единого идентификатора`,
        });
      }

      // Второй идентификатор повышает match rate
      if (emailShare > 0.5 && phoneShare < 0.3) {
        recs.push({
          severity: 'low',
          title: 'Добавьте телефон к email',
          detail:
            'Второй идентификатор (телефон) повышает долю сматченных конверсий. Убедитесь, что телефон заполняется в карточке контакта CRM.',
          metric: `телефон есть у ${Math.round(phoneShare * 100)}%`,
        });
      }

      // Доля успешных доставок
      if (ov.successRate != null && ov.successRate < 0.9) {
        const top = errors[0];
        recs.push({
          severity: ov.successRate < 0.7 ? 'high' : 'medium',
          title: 'Часть конверсий не доходит до платформы',
          detail: top
            ? `Основная причина отказов: «${top.category}». ${top.hint}`
            : 'Откройте «Сводку ошибок» на дашборде и устраните основные причины отказов.',
          metric: `success rate ${Math.round(ov.successRate * 100)}%`,
        });
      }

      // Оптимизация по ценности
      if (valueMappings === 0 && activeMappings > 0) {
        recs.push({
          severity: 'low',
          title: 'Включите передачу суммы для value-оптимизации',
          detail:
            'Ни один маппинг не передаёт сумму сделки. С суммой платформа может оптимизировать не на количество, а на ценность (ROAS) — выгоднее при разных чеках.',
        });
      }
    }

    // Health-score: матчинг (есть сильный идентификатор) + click-id + доставка
    const matchScore = total > 0 ? (total - mq.none) / total : 0;
    const clickScore = total > 0 ? mq.click_id / total : 0;
    const successScore = ov.successRate ?? (total > 0 ? 1 : 0);
    const score =
      total === 0 && brokenConnections.length === 0
        ? 0
        : Math.round(100 * (0.45 * matchScore + 0.25 * clickScore + 0.3 * successScore));

    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    recs.sort((a, b) => order[a.severity] - order[b.severity]);

    const level = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad';
    const summary =
      total === 0
        ? 'Недостаточно данных — настройте отправку конверсий.'
        : recs.length === 0
          ? 'Матчинг и доставка в порядке — так держать.'
          : `Найдено ${recs.length} рекомендаций для снижения цены за конверсию.`;

    return { score, level, summary, recommendations: recs, period: `${days}d` };
  }

  async filterOptions(workspaceId: string) {
    const [connections, destinations, events] = await Promise.all([
      this.prisma.crmConnection.findMany({
        where: { workspaceId },
        select: { id: true, name: true, type: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.destination.findMany({
        where: { workspaceId },
        select: { id: true, name: true, type: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.deliveryLog.findMany({
        where: { workspaceId },
        select: { eventName: true },
        distinct: ['eventName'],
        orderBy: { eventName: 'asc' },
      }),
    ]);
    return { connections, destinations, eventNames: events.map((e) => e.eventName) };
  }
}
