import { useState } from 'react';
import { api } from '../lib/api';
import type { Destination, DestinationKind } from '../lib/types';
import { Button, Field, Input } from './ui';

const STEPS = ['Платформа', 'Реквизиты', 'Проверка'];

interface ConfigField {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
}

interface Guide {
  title: string;
  desc: string;
  pixelLabel: string;
  pixelHint: string;
  tokenLabel: string;
  tokenHint: string;
  hasTestCode?: boolean;
  configFields?: ConfigField[];
}

const GUIDE: Record<DestinationKind, Guide> = {
  META: {
    title: 'Meta (Facebook / Instagram)',
    desc: 'Conversions API — серверные события в Meta Ads',
    pixelLabel: 'Pixel ID',
    pixelHint: 'Events Manager → Источники данных → ваш пиксель (ID под названием).',
    tokenLabel: 'Access Token',
    tokenHint: 'Events Manager → Настройки → Conversions API → Сгенерировать токен доступа.',
    hasTestCode: true,
  },
  TIKTOK: {
    title: 'TikTok',
    desc: 'Events API — серверные события в TikTok Ads',
    pixelLabel: 'Event Source ID (CRM Event Set ID)',
    pixelHint: 'Events Manager → создайте источник данных «CRM» → его CRM Event Set ID.',
    tokenLabel: 'Access Token',
    tokenHint: 'TikTok Events Manager → сгенерируйте Access Token для источника.',
    hasTestCode: true,
  },
  GOOGLE_ADS: {
    title: 'Google Ads',
    desc: 'Enhanced Conversions for Leads — офлайн-конверсии по gclid',
    pixelLabel: 'Customer ID (без дефисов)',
    pixelHint: 'Google Ads → ID аккаунта вверху справа (10 цифр).',
    tokenLabel: 'OAuth refresh token',
    tokenHint: 'Получается через OAuth-приложение Google (offline access).',
    configFields: [
      { key: 'developerToken', label: 'Developer token', hint: 'Google Ads API Center (нужно одобрение Google)', required: true },
      { key: 'conversionActionId', label: 'Conversion Action ID', hint: 'ID действия-конверсии в Google Ads', required: true },
      { key: 'clientId', label: 'OAuth Client ID', required: true },
      { key: 'clientSecret', label: 'OAuth Client Secret', required: true },
      { key: 'loginCustomerId', label: 'Login Customer ID (MCC, необязательно)' },
    ],
  },
  YANDEX: {
    title: 'Яндекс.Метрика',
    desc: 'Офлайн-конверсии по yclid → цель Метрики',
    pixelLabel: 'Номер счётчика Метрики',
    pixelHint: 'Яндекс.Метрика → настройки счётчика → номер счётчика.',
    tokenLabel: 'OAuth-токен',
    tokenHint: 'oauth.yandex.ru → токен с доступом к API Метрики.',
    configFields: [
      { key: 'goal', label: 'Идентификатор цели (target)', hint: 'Имя офлайн-цели в Метрике', required: true },
    ],
  },
};

export default function DestinationWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<DestinationKind | null>(null);
  const [created, setCreated] = useState<Destination | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({ name: '', pixelId: '', accessToken: '', testEventCode: '' });
  const [config, setConfig] = useState<Record<string, string>>({});

  const chooseType = (t: DestinationKind) => {
    setType(t);
    setConfig({});
    setStep(1);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    setError('');
    try {
      const cfg: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) if (v.trim()) cfg[k] = v.trim();
      const dest = await api<Destination>('/destinations', {
        method: 'POST',
        body: {
          type,
          name: form.name,
          pixelId: form.pixelId,
          accessToken: form.accessToken,
          testEventCode: form.testEventCode || undefined,
          config: Object.keys(cfg).length ? cfg : undefined,
        },
      });
      setCreated(dest);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания направления');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!created) return;
    setNotice('Отправляем тестовое событие…');
    const r = await api<{ ok: boolean; error?: string }>(`/destinations/${created.id}/test`, {
      method: 'POST',
    });
    setNotice(r.ok ? 'Тестовое событие отправлено успешно' : `Ошибка: ${r.error}`);
  };

  const guide = type ? GUIDE[type] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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

      {/* Шаг 1 — платформа */}
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['META', 'TIKTOK', 'GOOGLE_ADS', 'YANDEX'] as const).map((t) => (
            <button
              key={t}
              onClick={() => chooseType(t)}
              className="rounded-xl border border-slate-200 p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
            >
              <div className="text-lg font-semibold text-slate-900">{GUIDE[t].title}</div>
              <div className="mt-1 text-sm text-slate-500">{GUIDE[t].desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Шаг 2 — реквизиты с подсказками */}
      {step === 1 && guide && (
        <form onSubmit={create} className="space-y-4">
          <Field label="Название направления">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Основной аккаунт"
              required
            />
          </Field>
          <Field label={guide.pixelLabel}>
            <Input
              value={form.pixelId}
              onChange={(e) => setForm({ ...form, pixelId: e.target.value })}
              required
            />
          </Field>
          <p className="-mt-2 text-xs text-slate-500">{guide.pixelHint}</p>

          <Field label={guide.tokenLabel}>
            <Input
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              required
            />
          </Field>
          <p className="-mt-2 text-xs text-slate-500">{guide.tokenHint}</p>

          {guide.configFields?.map((cf) => (
            <div key={cf.key}>
              <Field label={cf.label}>
                <Input
                  value={config[cf.key] ?? ''}
                  onChange={(e) => setConfig({ ...config, [cf.key]: e.target.value })}
                  required={cf.required}
                />
              </Field>
              {cf.hint && <p className="-mt-2 text-xs text-slate-500">{cf.hint}</p>}
            </div>
          ))}

          {guide.hasTestCode && (
            <Field label="Test Event Code (необязательно, для проверки в «Тестовых событиях»)">
              <Input
                value={form.testEventCode}
                onChange={(e) => setForm({ ...form, testEventCode: e.target.value })}
              />
            </Field>
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

      {/* Шаг 3 — проверка тестовым событием */}
      {step === 2 && created && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Направление <b>{created.name}</b> создано. Отправьте тестовое событие, чтобы проверить
            реквизиты:
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={sendTest}>
              Отправить тестовое событие
            </Button>
            <Button onClick={onDone}>Готово</Button>
          </div>
        </div>
      )}
    </div>
  );
}
