import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

interface AlertSettings {
  enabled: boolean;
  telegramChatId: string;
  hasToken: boolean;
  lastSentAt: string | null;
}

export default function Alerts() {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AlertSettings>('/alerts')
      .then((s) => {
        setSettings(s);
        setChatId(s.telegramChatId);
        setEnabled(s.enabled);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setNotice('');
    try {
      const s = await api<AlertSettings>('/alerts', {
        method: 'PUT',
        body: {
          enabled,
          telegramChatId: chatId,
          ...(token ? { telegramBotToken: token } : {}),
        },
      });
      setSettings(s);
      setToken('');
      setNotice('Сохранено');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setNotice('Отправляем тестовое уведомление…');
    const r = await api<{ ok: boolean; error?: string }>('/alerts/test', { method: 'POST' });
    setNotice(r.ok ? 'Тестовое уведомление отправлено в Telegram' : `Ошибка: ${r.error}`);
  };

  return (
    <div>
      <PageHeader title="Уведомления" />

      {notice && <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}

      <Card className="mb-6 max-w-2xl">
        <h2 className="mb-1 font-semibold text-slate-900">Алерты в Telegram</h2>
        <p className="mb-4 text-sm text-slate-500">
          Раз в 15 минут платформа проверяет качество таргета и присылает в Telegram проблемы,
          которые повышают цену за конверсию (истёкший токен, мало click-id, падения доставки).
        </p>

        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Включить алерты
          </label>

          <Field label={`Токен бота${settings?.hasToken ? ' (сохранён — оставьте пустым, чтобы не менять)' : ''}`}>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={settings?.hasToken ? '••••••••' : '123456:ABC-DEF...'}
            />
          </Field>
          <p className="-mt-2 text-xs text-slate-500">
            Создайте бота у @BotFather → получите токен вида <code>123456:ABC…</code>.
          </p>

          <Field label="Chat ID">
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="напр. 123456789" />
          </Field>
          <p className="-mt-2 text-xs text-slate-500">
            Напишите боту любое сообщение, затем узнайте chat id у @userinfobot (или через
            getUpdates). Можно указать id группы.
          </p>

          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            <Button variant="secondary" onClick={test} disabled={!settings?.hasToken && !token}>
              Отправить тест
            </Button>
          </div>
          {settings?.lastSentAt && (
            <p className="text-xs text-slate-400">
              Последний алерт: {new Date(settings.lastSentAt).toLocaleString('ru-RU')}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
