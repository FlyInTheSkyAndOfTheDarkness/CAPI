import { useState } from 'react';

/**
 * Выбор периода для аналитики: быстрые пресеты + произвольный диапазон дат.
 * Даты считаются в UTC — так же, как бэкенд группирует доставки по дням.
 */
export type PeriodPreset = 'today' | 'yesterday' | '7' | '14' | '30' | 'custom';

export interface PeriodValue {
  preset: PeriodPreset;
  /** Границы произвольного диапазона (включительно), YYYY-MM-DD. */
  from: string;
  to: string;
}

const DAY = 86_400_000;

/** Дата в UTC формата YYYY-MM-DD со сдвигом на N дней назад. */
export function utcDay(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
}

export const DEFAULT_PERIOD: PeriodValue = { preset: '14', from: utcDay(13), to: utcDay(0) };

/** Параметры периода для эндпоинтов `/api/logs/*`. */
export function periodParams(v: PeriodValue): Record<string, string> {
  switch (v.preset) {
    case 'custom':
      return { from: v.from, to: v.to };
    case 'yesterday':
      return { from: utcDay(1), to: utcDay(1) };
    case 'today':
      return { days: '1' };
    default:
      return { days: v.preset };
  }
}

function formatDay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Подпись выбранного периода — для заголовков и подсказок. */
export function periodLabel(v: PeriodValue): string {
  switch (v.preset) {
    case 'today':
      return 'сегодня';
    case 'yesterday':
      return 'вчера';
    case 'custom':
      return v.from === v.to
        ? formatDay(v.from)
        : `${formatDay(v.from)} — ${formatDay(v.to)}`;
    default:
      return `последние ${v.preset} дн.`;
  }
}

const PRESETS: Array<{ key: PeriodPreset; label: string }> = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: '7', label: '7 дней' },
  { key: '14', label: '14 дней' },
  { key: '30', label: '30 дней' },
];

export default function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
}) {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');
  const today = utcDay(0);

  const pickPreset = (preset: PeriodPreset) => {
    setShowCustom(false);
    onChange({ ...value, preset });
  };

  // Диапазон держим упорядоченным: правка одной границы подтягивает вторую
  const setFrom = (from: string) => {
    if (!from) return;
    onChange({ preset: 'custom', from, to: value.to < from ? from : value.to });
  };
  const setTo = (to: string) => {
    if (!to) return;
    onChange({ preset: 'custom', from: value.from > to ? to : value.from, to });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => pickPreset(p.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              value.preset === p.key
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => {
            setShowCustom(true);
            onChange({ ...value, preset: 'custom' });
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value.preset === 'custom'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Период…
        </button>
      </div>

      {(showCustom || value.preset === 'custom') && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <input
            type="date"
            value={value.from}
            max={today}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            aria-label="Начало периода"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={value.to}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            aria-label="Конец периода"
          />
        </div>
      )}
    </div>
  );
}
