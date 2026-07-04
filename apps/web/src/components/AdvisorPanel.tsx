import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AdvisorData, AdvisorRec } from '../lib/types';

const LEVEL = {
  good: { ring: '#0ca30c', label: 'Отлично', bg: 'bg-green-50' },
  warn: { ring: '#d97706', label: 'Есть что улучшить', bg: 'bg-amber-50' },
  bad: { ring: '#d03b3b', label: 'Требует внимания', bg: 'bg-red-50' },
} as const;

const SEV: Record<AdvisorRec['severity'], { label: string; cls: string; dot: string }> = {
  critical: { label: 'Критично', cls: 'text-red-700', dot: '#d03b3b' },
  high: { label: 'Важно', cls: 'text-amber-700', dot: '#d97706' },
  medium: { label: 'Средне', cls: 'text-slate-600', dot: '#64748b' },
  low: { label: 'Совет', cls: 'text-slate-500', dot: '#94a3b8' },
};

/** Кольцевой индикатор score 0-100. */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="700" fill="#0f172a">
        {score}
      </text>
    </svg>
  );
}

export default function AdvisorPanel() {
  const [data, setData] = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AdvisorData>('/logs/advisor')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-400">
        Советник анализирует данные…
      </div>
    );
  }

  const lvl = LEVEL[data.level];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-4">
        <ScoreRing score={data.score} color={lvl.ring} />
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900">Советник по эффективности</h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `${lvl.ring}1a`, color: lvl.ring }}
            >
              {lvl.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{data.summary}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Оценка качества таргета из матчинга, click-id и доставки. Выше — дешевле конверсия.
          </p>
        </div>
      </div>

      {data.recommendations.length > 0 && (
        <ul className="space-y-2.5">
          {data.recommendations.map((r, i) => {
            const s = SEV[r.severity];
            return (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{r.title}</span>
                    <span className={`text-xs font-medium ${s.cls}`}>{s.label}</span>
                    {r.metric && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {r.metric}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
