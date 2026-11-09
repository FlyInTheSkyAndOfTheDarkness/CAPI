import { useState } from 'react';
import { api } from '../lib/api';
import type { Destination } from '../lib/types';
import { Button, Field, Input } from './ui';
import { GUIDE } from './destination-guide';

export default function DestinationTest({ destination }: { destination: Destination }) {
  const needsCode = Boolean(GUIDE[destination.type].hasTestCode);
  const [code, setCode] = useState(destination.testEventCode ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ ok: boolean; error?: string }>(`/destinations/${destination.id}/test`, {
        method: 'POST',
        body: needsCode ? { testEventCode: code.trim() } : undefined,
      });
      setResult({
        ok: r.ok,
        message: r.ok
          ? 'Платформа приняла проверочное событие. Проверьте его в Events Manager. Эта проверка не проверяет приём вебхука из CRM.'
          : r.error || 'Платформа не приняла проверочное событие.',
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Не удалось отправить событие.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      {needsCode ? (
        <>
          <Field label="Test Event Code для этой проверки">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={100} disabled={busy} />
          </Field>
          <p className="text-xs text-slate-500">
            Скопируйте код из Events Manager → Тестирование событий. Код действует только для
            этой проверки; рабочие события из CRM продолжат отправляться по настройкам направления.
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-700">Проверочное событие этой платформы может попасть в рабочую статистику.</p>
      )}
      {result && (
        <p role="status" className={`rounded-lg px-4 py-2 text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={busy || (needsCode && !code.trim())}>
        {busy ? 'Отправляем…' : 'Отправить проверочное событие'}
      </Button>
    </form>
  );
}
