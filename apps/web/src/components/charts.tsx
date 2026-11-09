import { useEffect, useRef, useState } from 'react';
import type { HeatCell, TrendPoint } from '../lib/types';

const INK = { secondary: '#475569', muted: '#64748b', grid: '#e2e8f0', baseline: '#cbd5e1' };
const LINE = '#2a78d6';

// Синяя последовательная шкала (dataviz palette) — от «почти ноль» к максимуму
const BLUE_RAMP = ['#eef4fd', '#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6', '#184f95', '#0d366b'];

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const cw = e[0]?.contentRect.width;
      if (cw && cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function fmtDay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** Тренд success rate по дням (одна серия, 0–100%). */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const M = { top: 16, right: 14, bottom: 24, left: 36 };
  const H = 200;
  const plotW = Math.max(width - M.left - M.right, 60);
  const plotH = H - M.top - M.bottom;
  const n = Math.max(points.length, 1);
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const x = (i: number) => M.left + (n > 1 ? i * stepX : plotW / 2);
  const y = (rate: number) => M.top + plotH - rate * plotH;

  const labelEvery = Math.max(1, Math.ceil(34 / (stepX || 34)));
  // Сегменты линии между соседними точками с определённым successRate (разрыв на null)
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.successRate == null) {
      if (cur) segs.push(cur);
      cur = '';
    } else {
      cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.successRate).toFixed(1)} `;
    }
  });
  if (cur) segs.push(cur);

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label="Тренд success rate по дням">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth={1} />
            <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={10} fill={INK.muted}>
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {segs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          p.successRate == null ? null : (
            <circle key={p.date} cx={x(i)} cy={y(p.successRate)} r={hover === i ? 4.5 : 3} fill={LINE} stroke="#fff" strokeWidth={2} />
          ),
        )}
        {points.map((p, i) =>
          (n - 1 - i) % labelEvery === 0 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK.muted}>
              {fmtDay(p.date)}
            </text>
          ) : null,
        )}
        {/* Хит-области по дням */}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - (stepX || plotW) / 2}
            y={M.top}
            width={stepX || plotW}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: 4, transform: 'translateX(-50%)' }}
        >
          <div className="text-slate-500">{fmtDay(points[hover].date)}</div>
          <div className="font-semibold text-slate-900">
            {points[hover].successRate == null ? 'нет данных' : `${Math.round(points[hover].successRate! * 100)}% успех`}
          </div>
          <div className="text-slate-500">
            {points[hover].sent} отпр. · {points[hover].failed} ошиб.
          </div>
        </div>
      )}
    </div>
  );
}

/** Тепловая карта активности: день недели × час (последовательная синяя шкала). */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const grid = new Map<string, number>();
  let max = 0;
  for (const c of cells) {
    grid.set(`${c.dow}-${c.hour}`, c.count);
    if (c.count > max) max = c.count;
  }
  const color = (v: number) => {
    if (v <= 0) return '#f8fafc';
    const idx = Math.min(BLUE_RAMP.length - 1, 1 + Math.floor((v / Math.max(max, 1)) * (BLUE_RAMP.length - 2)));
    return BLUE_RAMP[idx];
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 560 }}>
          {/* Часовая шкала */}
          <div className="mb-1 flex pl-8">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-slate-400">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
            <div key={dow} className="mb-0.5 flex items-center">
              <div className="w-8 shrink-0 text-xs text-slate-500">{DOW[dow - 1]}</div>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: 24 }, (_, h) => {
                  const v = grid.get(`${dow}-${h}`) ?? 0;
                  return (
                    <div
                      key={h}
                      className="h-5 flex-1 rounded-sm"
                      style={{ background: color(v) }}
                      title={`${DOW[dow - 1]} ${h}:00 — ${v}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Легенда */}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span>меньше</span>
        {BLUE_RAMP.map((c) => (
          <span key={c} className="h-3 w-4 rounded-sm" style={{ background: c }} />
        ))}
        <span>больше</span>
      </div>
    </div>
  );
}

/** Подневные столбцы одной метрики (одна серия, без второй оси). */
export function DailyBars({
  points,
  label,
  format,
}: {
  points: Array<{ date: string; value: number | null }>;
  /** Название метрики — для подписи и aria */
  label: string;
  format: (v: number) => string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const M = { top: 16, right: 12, bottom: 24, left: 64 };
  const H = 220;
  const plotW = Math.max(width - M.left - M.right, 60);
  const plotH = H - M.top - M.bottom;
  const n = Math.max(points.length, 1);
  const slot = plotW / n;
  const barW = Math.max(Math.min(slot - 2, 28), 2);
  const max = Math.max(...points.map((p) => p.value ?? 0), 0);
  // «Круглый» верх шкалы: 1/2/5 × 10^k
  const niceMax = (() => {
    if (max <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(max));
    const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= max) ?? 10;
    return step * pow;
  })();
  const y = (v: number) => M.top + plotH - (v / niceMax) * plotH;
  const x = (i: number) => M.left + i * slot + slot / 2;
  const labelEvery = Math.max(1, Math.ceil(40 / slot));

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={`${label} по дням`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t * niceMax)} y2={y(t * niceMax)} stroke={t === 0 ? INK.baseline : INK.grid} strokeWidth={1} />
            <text x={M.left - 6} y={y(t * niceMax)} textAnchor="end" dominantBaseline="central" fontSize={10} fill={INK.muted}>
              {t === 0 ? '0' : format(t * niceMax)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const v = p.value ?? 0;
          if (v <= 0) return null;
          const top = y(v);
          const h = Math.max(M.top + plotH - top, 1);
          const r = Math.min(4, barW / 2, h);
          const x0 = x(i) - barW / 2;
          const base = M.top + plotH;
          // Скруглён только верх, низ стоит на базовой линии
          const d = `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`;
          return <path key={p.date} d={d} fill={LINE} opacity={hover === null || hover === i ? 1 : 0.55} />;
        })}
        {points.map((p, i) =>
          (n - 1 - i) % labelEvery === 0 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK.muted}>
              {fmtDay(p.date)}
            </text>
          ) : null,
        )}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={M.left + i * slot}
            y={M.top}
            width={slot}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: 4, transform: 'translateX(-50%)' }}
        >
          <div className="text-slate-500">{fmtDay(points[hover].date)}</div>
          <div className="font-semibold text-slate-900">
            {points[hover].value == null ? 'нет данных' : format(points[hover].value!)}
          </div>
          <div className="text-slate-500">{label}</div>
        </div>
      )}
    </div>
  );
}
