import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DailyPoint } from '../lib/types';

/**
 * Статусная палитра (не категориальная): серии означают good/bad.
 * Проверена валидатором dataviz на белой поверхности: худшая соседняя пара
 * sent↔failed — CVD ΔE 12.4 (deutan) ≥ 12. Жёлтый (pending) ниже 3:1 по
 * контрасту — по правилу relief его значения продублированы иконкой в легенде,
 * тултипом и табличным представлением. Порядок стека фиксирован и сам по себе
 * кодирует серию (sent всегда у базовой линии).
 */
export const STATUS_SERIES = [
  { key: 'sent', label: 'Отправлено', glyph: '✓', color: '#0ca30c' },
  { key: 'failed', label: 'Ошибки', glyph: '✕', color: '#d03b3b' },
  { key: 'pending', label: 'В очереди', glyph: '⋯', color: '#fab219' },
  { key: 'skipped', label: 'Пропущено', glyph: '—', color: '#898781' },
] as const;

const INK = {
  secondary: '#475569',
  muted: '#64748b',
  grid: '#e2e8f0',
  baseline: '#cbd5e1',
  highlight: '#f1f5f9',
};

const M = { top: 26, right: 8, bottom: 26, left: 40 };
const PLOT_H = 220;
const SEGMENT_GAP = 2;

const nf = new Intl.NumberFormat('ru-RU');

function niceScale(maxValue: number): { max: number; step: number } {
  const target = Math.max(maxValue, 4);
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const step of steps) {
    if (target / step <= 5) {
      return { step, max: Math.ceil(target / step) * step };
    }
  }
  const step = 100_000;
  return { step, max: Math.ceil(target / step) * step };
}

function formatDay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

function formatDateFull(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function totalOf(d: DailyPoint): number {
  return d.sent + d.failed + d.pending + d.skipped;
}

export default function DeliveryChart({ days }: { days: DailyPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const clipBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totals = useMemo(() => days.map(totalOf), [days]);
  const maxTotal = totals.length ? Math.max(...totals) : 0;
  const { max: yMax, step } = niceScale(maxTotal);

  const height = M.top + PLOT_H + M.bottom;
  const plotW = Math.max(width - M.left - M.right, 80);
  const n = Math.max(days.length, 1);
  const band = plotW / n;
  const barW = Math.min(24, Math.max(5, band * 0.6));
  const y = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H;

  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += step) ticks.push(t);
  // Подписи оси X прореживаем от последнего дня, чтобы «сегодня» всегда было подписано
  const labelEvery = Math.max(1, Math.ceil(34 / band));
  const peakIdx = maxTotal > 0 ? totals.indexOf(maxTotal) : -1;

  const centerOf = (i: number) => M.left + i * band + band / 2;

  return (
    <div ref={containerRef} className="relative" onPointerLeave={() => setHover(null)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {STATUS_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.glyph} {s.label}
          </span>
        ))}
      </div>

      <svg width={width} height={height} role="img" aria-label="Доставки конверсий по дням">
        {/* Сетка: сплошные волосяные линии, ось — чуть темнее */}
        {ticks.map((t) => (
          <g key={t}>
            {t > 0 && (
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={INK.grid}
                strokeWidth={1}
              />
            )}
            <text
              x={M.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={11}
              fill={INK.muted}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {nf.format(t)}
            </text>
          </g>
        ))}
        <line
          x1={M.left}
          x2={M.left + plotW}
          y1={y(0)}
          y2={y(0)}
          stroke={INK.baseline}
          strokeWidth={1}
        />

        {/* Подсветка колонки под курсором / фокусом */}
        {hover !== null && days[hover] && (
          <rect
            x={M.left + hover * band + 1}
            y={M.top}
            width={Math.max(band - 2, 2)}
            height={PLOT_H}
            rx={6}
            fill={INK.highlight}
          />
        )}

        {/* Колонки: стек растёт от базовой линии; верх стека скруглён 4px через clipPath,
            низ квадратный; между сегментами 2px просвет поверхности */}
        {days.map((d, i) => {
          const x = centerOf(i) - barW / 2;
          const segments: Array<{ color: string; y: number; h: number }> = [];
          let cum = 0;
          let drawnBelow = false;
          for (const s of STATUS_SERIES) {
            const v = d[s.key];
            if (v <= 0) continue;
            const yTop = y(cum + v);
            let h = y(cum) - yTop;
            if (drawnBelow && h > SEGMENT_GAP + 1) h -= SEGMENT_GAP;
            h = Math.max(h, 1.5);
            segments.push({ color: s.color, y: yTop, h });
            cum += v;
            drawnBelow = true;
          }
          if (!segments.length) return null;
          const stackTop = y(cum);
          const rx = Math.min(4, barW / 2);
          const clipId = `${clipBase}-${i}`;
          return (
            <g key={d.date}>
              <clipPath id={clipId}>
                <rect x={x} y={stackTop} width={barW} height={PLOT_H + 8} rx={rx} />
              </clipPath>
              <g
                clipPath={`url(#${clipId})`}
                style={hover === i ? { filter: 'brightness(1.08)' } : undefined}
              >
                {segments.map((seg, k) => (
                  <rect key={k} x={x} y={seg.y} width={barW} height={seg.h} fill={seg.color} />
                ))}
              </g>
            </g>
          );
        })}

        {/* Выборочная прямая подпись: только пиковый день */}
        {peakIdx >= 0 && hover !== peakIdx && (
          <text
            x={Math.min(Math.max(centerOf(peakIdx), M.left + 12), width - 14)}
            y={y(totals[peakIdx]) - 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill={INK.secondary}
          >
            {nf.format(totals[peakIdx])}
          </text>
        )}

        {/* Подписи оси X */}
        {days.map((d, i) =>
          (n - 1 - i) % labelEvery === 0 ? (
            <text
              key={d.date}
              x={centerOf(i)}
              y={M.top + PLOT_H + 17}
              textAnchor="middle"
              fontSize={11}
              fill={INK.muted}
            >
              {formatDay(d.date)}
            </text>
          ) : null,
        )}

        {/* Хит-таргеты: вся полоса дня, доступны с клавиатуры */}
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={M.left + i * band}
            y={M.top}
            width={band}
            height={PLOT_H}
            fill="transparent"
            tabIndex={0}
            aria-label={`${formatDateFull(d.date)}: всего ${totalOf(d)}, отправлено ${d.sent}, ошибки ${d.failed}, в очереди ${d.pending}, пропущено ${d.skipped}`}
            style={{ outline: 'none' }}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          />
        ))}
      </svg>

      {/* Тултип: одна выноска — все серии; значение впереди, серия — штрихом цвета.
          Ставится сбоку от колонки, чтобы не закрывать её вершину */}
      {hover !== null && days[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left:
              centerOf(hover) < width / 2
                ? Math.min(centerOf(hover) + band / 2 + 10, width - 8)
                : Math.max(centerOf(hover) - band / 2 - 10, 8),
            top: M.top + 2,
            minWidth: 156,
            transform: centerOf(hover) < width / 2 ? undefined : 'translateX(-100%)',
          }}
        >
          <div className="mb-1 text-xs text-slate-500">
            {formatDay(days[hover].date)} · всего{' '}
            <span className="font-semibold text-slate-900">{nf.format(totalOf(days[hover]))}</span>
          </div>
          {STATUS_SERIES.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5 text-xs">
              <span className="h-[3px] w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="font-semibold tabular-nums text-slate-900">
                {nf.format(days[hover][s.key])}
              </span>
              <span className="text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {maxTotal === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-slate-400">Нет отправок за выбранный период</span>
        </div>
      )}
    </div>
  );
}

/** Табличный двойник графика — все значения доступны без наведения. */
export function DeliveryTable({ days }: { days: DailyPoint[] }) {
  const rows = [...days].reverse();
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <th className="px-2 py-2 font-medium">Дата</th>
            {STATUS_SERIES.map((s) => (
              <th key={s.key} className="px-2 py-2 text-right font-medium">
                {s.glyph} {s.label}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Всего</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date} className="border-b border-slate-100">
              <td className="px-2 py-1.5 text-slate-600">{formatDateFull(d.date)}</td>
              {STATUS_SERIES.map((s) => (
                <td
                  key={s.key}
                  className={`px-2 py-1.5 text-right tabular-nums ${
                    d[s.key] === 0 ? 'text-slate-300' : 'text-slate-900'
                  }`}
                >
                  {nf.format(d[s.key])}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-900">
                {nf.format(totalOf(d))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
