import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Connection } from '../lib/types';
import { Button, CopyField, Field, Input } from './ui';

type CrmType = 'AMOCRM' | 'BITRIX24';
type AuthMethod = 'oauth' | 'token';

const STEPS = ['Тип CRM', 'Реквизиты', 'Готово'];

export default function ConnectionWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<CrmType | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('oauth');
  const [redirectUri, setRedirectUri] = useState('');
  const [created, setCreated] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    name: '',
    baseUrl: '',
    clientId: '',
    clientSecret: '',
    accessToken: '',
    appToken: '',
  });

  useEffect(() => {
    api<{ redirectUri: string }>('/connections/amocrm/redirect-uri')
      .then((r) => setRedirectUri(r.redirectUri))
      .catch(() => {});
  }, []);

  const chooseType = (t: CrmType) => {
    setType(t);
    setAuthMethod('oauth');
    setStep(1);
  };

  const createConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    setError('');
    try {
      const body =
        type === 'AMOCRM'
          ? {
              type,
              name: form.name,
              baseUrl: form.baseUrl,
              clientId: authMethod === 'oauth' ? form.clientId || undefined : undefined,
              clientSecret: authMethod === 'oauth' ? form.clientSecret || undefined : undefined,
              accessToken: authMethod === 'token' ? form.accessToken || undefined : undefined,
            }
          : {
              type,
              name: form.name,
              baseUrl: form.baseUrl,
              appToken: form.appToken || undefined,
            };
      const conn = await api<Connection>('/connections', { method: 'POST', body });
      setCreated(conn);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания подключения');
    } finally {
      setBusy(false);
    }
  };

  const startOauth = async () => {
    if (!created) return;
    try {
      const { url } = await api<{ url: string }>(`/connections/${created.id}/amocrm/oauth-url`);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка OAuth');
    }
  };

  const subscribeWebhook = async () => {
    if (!created) return;
    setNotice('Подписываем вебхук…');
    const r = await api<{ ok: boolean; created?: boolean; error?: string }>(
      `/connections/${created.id}/amocrm/webhook`,
      { method: 'POST' },
    );
    setNotice(
      r.ok
        ? r.created
          ? 'Вебхук подписан на события лидов'
          : 'Вебхук уже был подписан'
        : `Не удалось подписать вебхук: ${r.error}`,
    );
  };

  const test = async () => {
    if (!created) return;
    setNotice('Проверяем подключение…');
    const r = await api<{ ok: boolean; error?: string }>(`/connections/${created.id}/test`, {
      method: 'POST',
    });
    setNotice(r.ok ? 'Подключение работает' : `Ошибка: ${r.error}`);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Шаги */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                i < step
                  ? 'bg-green-100 text-green-700'
                  : i === step
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className={`text-sm ${i === step ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 text-slate-300">→</span>}
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}

      {/* Шаг 1 — выбор CRM */}
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              { t: 'AMOCRM' as const, title: 'amoCRM', desc: 'OAuth или долгосрочный токен, авто-подписка вебхука' },
              { t: 'BITRIX24' as const, title: 'Битрикс24', desc: 'Входящий вебхук + исходящий вебхук событий' },
            ]
          ).map((o) => (
            <button
              key={o.t}
              onClick={() => chooseType(o.t)}
              className="rounded-xl border border-slate-200 p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
            >
              <div className="text-lg font-semibold text-slate-900">{o.title}</div>
              <div className="mt-1 text-sm text-slate-500">{o.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Шаг 2 — реквизиты */}
      {step === 1 && type && (
        <form onSubmit={createConnection} className="space-y-4">
          <Field label="Название подключения">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Основной аккаунт"
              required
            />
          </Field>

          {type === 'AMOCRM' ? (
            <>
              <Field label="Адрес аккаунта amoCRM">
                <Input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://mycompany.amocrm.ru"
                  required
                />
              </Field>

              <div className="flex gap-2">
                {(
                  [
                    { m: 'oauth' as const, label: 'OAuth (рекомендуется)' },
                    { m: 'token' as const, label: 'Долгосрочный токен' },
                  ]
                ).map((o) => (
                  <button
                    key={o.m}
                    type="button"
                    onClick={() => setAuthMethod(o.m)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      authMethod === o.m
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {authMethod === 'oauth' ? (
                <>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="mb-1 text-xs font-medium text-slate-500">
                      1. Вставьте этот Redirect URI в настройки интеграции amoCRM:
                    </div>
                    <CopyField value={redirectUri || '—'} />
                    <div className="mt-2 text-xs text-slate-500">
                      2. Скопируйте оттуда ID интеграции и Секретный ключ и вставьте ниже.
                    </div>
                  </div>
                  <Field label="ID интеграции (Client ID)">
                    <Input
                      value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Секретный ключ (Client Secret)">
                    <Input
                      value={form.clientSecret}
                      onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                      required
                    />
                  </Field>
                </>
              ) : (
                <Field label="Долгосрочный токен (вкладка «Ключи и доступы»)">
                  <Input
                    value={form.accessToken}
                    onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                    required
                  />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="URL входящего вебхука Битрикс24">
                <Input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://company.bitrix24.ru/rest/1/abc123xyz"
                  required
                />
              </Field>
              <Field label="application_token исходящего вебхука (необязательно)">
                <Input
                  value={form.appToken}
                  onChange={(e) => setForm({ ...form, appToken: e.target.value })}
                  placeholder="Доп. проверка подлинности событий"
                />
              </Field>
              <p className="text-sm text-slate-500">
                Входящий вебхук: Разработчикам → Другое → Входящий вебхук, права CRM (crm).
              </p>
            </>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(0)}>
              Назад
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Создаём…' : 'Создать и продолжить'}
            </Button>
          </div>
        </form>
      )}

      {/* Шаг 3 — готово */}
      {step === 2 && created && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Подключение <b>{created.name}</b> создано.
          </p>

          {created.type === 'AMOCRM' && authMethod === 'oauth' && !created.hasToken && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="mb-2 text-sm text-slate-700">
                Завершите авторизацию — вебхук подпишется автоматически:
              </p>
              <Button onClick={startOauth}>Авторизовать в amoCRM</Button>
            </div>
          )}

          {created.type === 'AMOCRM' && authMethod === 'token' && (
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-2 text-sm text-slate-700">
                Подпишите вебхук на события лидов:
              </p>
              <Button variant="secondary" onClick={subscribeWebhook}>
                Подписать вебхук
              </Button>
            </div>
          )}

          {created.type === 'BITRIX24' && (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-1 text-xs font-medium text-slate-500">
                Настройте исходящий вебхук в Битрикс24 на этот URL (события ONCRMDEALUPDATE, ONCRMLEADUPDATE):
              </div>
              <CopyField value={created.webhookUrl} />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={test}>
              Проверить подключение
            </Button>
            <Button onClick={onDone}>Готово</Button>
          </div>
        </div>
      )}
    </div>
  );
}
