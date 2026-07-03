import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DiagnosticCheck } from '../lib/types';

const ICON: Record<DiagnosticCheck['status'], { glyph: string; cls: string }> = {
  ok: { glyph: '✓', cls: 'bg-green-100 text-green-700' },
  warn: { glyph: '!', cls: 'bg-amber-100 text-amber-700' },
  fail: { glyph: '✕', cls: 'bg-red-100 text-red-700' },
};

export default function DiagnosticsPanel({ connectionId }: { connectionId: string }) {
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [loading, setLoading] = useState(true);

  const run = () => {
    setLoading(true);
    api<DiagnosticCheck[]>(`/connections/${connectionId}/diagnostics`)
      .then(setChecks)
      .catch(() => setChecks([]))
      .finally(() => setLoading(false));
  };

  useEffect(run, [connectionId]);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-slate-500">Диагностика</span>
        <button
          onClick={run}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          disabled={loading}
        >
          {loading ? 'Проверяем…' : 'Обновить'}
        </button>
      </div>
      <ul className="space-y-2">
        {(checks ?? []).map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ICON[c.status].cls}`}
            >
              {ICON[c.status].glyph}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{c.label}</div>
              <div className="text-xs text-slate-500">{c.detail}</div>
            </div>
          </li>
        ))}
        {!loading && checks?.length === 0 && (
          <li className="text-sm text-slate-500">Не удалось получить диагностику.</li>
        )}
      </ul>
    </div>
  );
}
