import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Connection } from '../lib/types';
import { Badge, Button, Card, CopyField, PageHeader } from '../components/ui';
import ConnectionWizard from '../components/ConnectionWizard';
import DiagnosticsPanel from '../components/DiagnosticsPanel';

export default function Connections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openDiag, setOpenDiag] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const load = useCallback(async () => {
    setConnections(await api<Connection[]>('/connections'));
  }, []);

  useEffect(() => {
    void load();
    const oauth = searchParams.get('oauth');
    if (oauth === 'success') setNotice('amoCRM успешно подключён через OAuth, вебхук подписан');
    if (oauth === 'error') setError('Не удалось завершить OAuth amoCRM');
  }, [load, searchParams]);

  const startOauth = async (id: string) => {
    try {
      const { url } = await api<{ url: string }>(`/connections/${id}/amocrm/oauth-url`);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка OAuth');
    }
  };

  const subscribeWebhook = async (id: string) => {
    const r = await api<{ ok: boolean; created?: boolean; error?: string }>(
      `/connections/${id}/amocrm/webhook`,
      { method: 'POST' },
    );
    setNotice(r.ok ? (r.created ? 'Вебхук подписан' : 'Вебхук уже подписан') : `Ошибка: ${r.error}`);
  };

  const test = async (id: string) => {
    const result = await api<{ ok: boolean; error?: string }>(`/connections/${id}/test`, {
      method: 'POST',
    });
    setNotice(result.ok ? 'Подключение работает' : `Ошибка подключения: ${result.error}`);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить подключение? Связанные маппинги тоже удалятся.')) return;
    await api(`/connections/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Подключения CRM"
        action={
          <Button onClick={() => setShowWizard(!showWizard)}>
            {showWizard ? 'Закрыть мастер' : '+ Добавить CRM'}
          </Button>
        }
      />

      {notice && <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {showWizard && (
        <div className="mb-6">
          <ConnectionWizard
            onDone={() => {
              setShowWizard(false);
              void load();
            }}
          />
        </div>
      )}

      <div className="space-y-4">
        {connections.length === 0 && !showWizard && (
          <Card>
            <p className="text-sm text-slate-500">
              Пока нет подключений. Нажмите «Добавить CRM» — мастер проведёт по шагам.
            </p>
          </Card>
        )}
        {connections.map((c) => (
          <Card key={c.id}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">{c.name}</span>
                <Badge value={c.type} />
                <Badge value={c.status} />
              </div>
              <div className="flex gap-2">
                {c.type === 'AMOCRM' && !c.hasToken && (
                  <Button variant="secondary" onClick={() => startOauth(c.id)}>
                    Подключить OAuth
                  </Button>
                )}
                {c.type === 'AMOCRM' && c.hasToken && (
                  <Button variant="secondary" onClick={() => subscribeWebhook(c.id)}>
                    Подписать вебхук
                  </Button>
                )}
                <Button variant="secondary" onClick={() => test(c.id)}>
                  Проверить
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setOpenDiag(openDiag === c.id ? null : c.id)}
                >
                  Диагностика
                </Button>
                <Button variant="danger" onClick={() => remove(c.id)}>
                  Удалить
                </Button>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-slate-500">{c.baseUrl}</div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">
                  URL для вебхука {c.type === 'AMOCRM' ? '(подписывается автоматически)' : '(Битрикс24 → Исходящий вебхук)'}:
                </div>
                <CopyField value={c.webhookUrl} />
              </div>
              {c.type === 'AMOCRM' && c.amoRedirectUri && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500">
                    Redirect URI для настроек интеграции amoCRM:
                  </div>
                  <CopyField value={c.amoRedirectUri} />
                </div>
              )}
            </div>
            {openDiag === c.id && <DiagnosticsPanel connectionId={c.id} />}
          </Card>
        ))}
      </div>
    </div>
  );
}
