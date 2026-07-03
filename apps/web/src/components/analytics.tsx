import type { BreakdownRow, ErrorRow, FunnelRow } from '../lib/types';

const nf = new Intl.NumberFormat('ru-RU');
const SENT = '#0ca30c';
const WARN = '#d97706';
const FAILED = '#d03b3b';
const FUNNEL = '#4f46e5';

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

/** Цвет полосы доли успеха: ≥90% зелёный, ≥70% янтарный, ниже красный. */
function rateColor(v: number | null): string {
  if (v == null) return '#cbd5e1';
  return v >= 0.9 ? SENT : v >= 0.7 ? WARN : FAILED;
}

/** Разрез по измерению (направление / событие) с долей успешных доставок. */
export function BreakdownCard({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyHint}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-700">{r.label}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  <span className="font-semibold text-slate-900">{nf.format(r.sent)}</span>
                  {r.failed > 0 && <span className="text-red-600"> · {nf.format(r.failed)} ошиб.</span>}
                  <span className="ml-2 text-xs">{pct(r.successRate)}</span>
                </span>
              </div>
              {/* Тонкая полоса: доля успешных доставок */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((r.successRate ?? 0) * 100)}%`,
                    background: rateColor(r.successRate),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Сводка ошибок: топ причин с количеством и подсказкой как чинить. */
export function ErrorSummary({ errors }: { errors: ErrorRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Сводка ошибок</h2>
      {errors.length === 0 ? (
        <p className="text-sm text-slate-500">Ошибок за выбранный период нет.</p>
      ) : (
        <ul className="space-y-3">
          {errors.map((e) => (
            <li key={e.category} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold tabular-nums text-red-700">
                {nf.format(e.count)}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{e.category}</div>
                <div className="text-xs text-slate-500">{e.hint}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  последняя: {new Date(e.lastSeen).toLocaleString('ru-RU')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Воронка событий: горизонтальные полосы по объёму успешных конверсий. */
export function Funnel({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sent));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Воронка событий</h2>
      <p className="mb-3 text-xs text-slate-500">Успешно отправленные конверсии по типам событий</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Событий за период нет.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.eventName} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm text-slate-700">{r.eventName}</span>
              <div className="flex-1">
                <div className="h-6 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="flex h-full items-center justify-end rounded-md px-2"
                    style={{ width: `${Math.max((r.sent / max) * 100, 6)}%`, background: FUNNEL }}
                  >
                    <span className="text-xs font-semibold tabular-nums text-white">
                      {nf.format(r.sent)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
