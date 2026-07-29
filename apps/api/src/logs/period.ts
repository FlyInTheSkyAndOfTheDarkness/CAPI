/**
 * Период аналитики — полуинтервал [since, until) в UTC, всегда по границам суток.
 * Задаётся либо числом последних дней (`days`, период кончается сегодня), либо
 * явными датами `from`/`to` (включительно, формат YYYY-MM-DD).
 */
export interface Period {
  since: Date;
  until: Date;
  /** Число суток в периоде — размер сетки для подневных графиков. */
  days: number;
  /** Первый день периода, YYYY-MM-DD. */
  from: string;
  /** Последний день периода включительно, YYYY-MM-DD. */
  to: string;
}

const DAY = 86_400_000;
/** Верхняя граница произвольного диапазона — год. */
const MAX_RANGE_DAYS = 366;
/** Верхняя граница пресета «последние N дней». */
const MAX_PRESET_DAYS = 90;

function parseDay(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function build(since: Date, until: Date): Period {
  return {
    since,
    until,
    days: Math.round((until.getTime() - since.getTime()) / DAY),
    from: dayString(since),
    to: dayString(new Date(until.getTime() - DAY)),
  };
}

/**
 * Разбирает параметры запроса в период. Некорректные значения не роняют запрос,
 * а откатываются к пресету по умолчанию (7 дней).
 */
export function resolvePeriod(query?: {
  days?: string;
  from?: string;
  to?: string;
}): Period {
  const from = parseDay(query?.from);
  if (from) {
    // `to` раньше `from` (перепутали местами) трактуем как один день
    const to = parseDay(query?.to);
    const end = to && to >= from ? to : from;
    const maxEnd = new Date(from.getTime() + (MAX_RANGE_DAYS - 1) * DAY);
    return build(from, new Date(Math.min(end.getTime(), maxEnd.getTime()) + DAY));
  }

  const days = Math.min(Math.max(Number(query?.days) || 7, 1), MAX_PRESET_DAYS);
  const until = new Date(todayUtc().getTime() + DAY);
  return build(new Date(until.getTime() - days * DAY), until);
}

/** Предыдущий равный по длине период — для сравнения «период к периоду». */
export function previousPeriod(period: Period): Period {
  return build(new Date(period.since.getTime() - period.days * DAY), period.since);
}

/** Дни периода в виде YYYY-MM-DD — сетка для подневных разрезов. */
export function periodDays(period: Period): string[] {
  return Array.from({ length: period.days }, (_, i) =>
    dayString(new Date(period.since.getTime() + i * DAY)),
  );
}
