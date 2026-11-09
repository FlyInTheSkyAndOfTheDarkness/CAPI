import { useState } from 'react';
import { api } from '../lib/api';
import type { Destination } from '../lib/types';
import { Button, Field, Input } from './ui';
import { GUIDE } from './destination-guide';

/**
 * Правка реквизитов уже созданного направления. Токен с сервера приходит только
 * замаскированным, поэтому поле пустое: пустое значение = «оставить прежний».
 */
export default function DestinationEditor({
  destination,
  onSaved,
  onCancel,
}: {
  destination: Destination;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const guide = GUIDE[destination.type];
  const [form, setForm] = useState({
    name: destination.name,
    pixelId: destination.pixelId,
    accessToken: '',
    testEventCode: destination.testEventCode ?? '',
  });
  const [config, setConfig] = useState<Record<string, string>>({ ...(destination.config ?? {}) });
  const [busy, setBusy] = useState(false);
  const [adsAccessToken, setAdsAccessToken] = useState('');
  const [removeAdsToken, setRemoveAdsToken] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cfg: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) if (v.trim()) cfg[k] = v.trim();
      await api(`/destinations/${destination.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          pixelId: form.pixelId,
          // Пустое поле — токен не меняем
          ...(form.accessToken.trim() ? { accessToken: form.accessToken.trim() } : {}),
          ...(destination.type === 'META' && removeAdsToken
            ? { adsAccessToken: null }
            : destination.type === 'META' && adsAccessToken.trim()
              ? { adsAccessToken: adsAccessToken.trim() }
              : {}),
          testEventCode: form.testEventCode,
          ...(guide.configFields ? { config: cfg } : {}),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить направление');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <Field label="Название направления">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
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
          type="password"
          autoComplete="new-password"
          value={form.accessToken}
          onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
          placeholder={`Сейчас: ${destination.accessTokenMasked} — оставьте пустым, чтобы не менять`}
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

      {destination.type === 'META' && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <Field label="Отдельный токен рекламной статистики (необязательно)">
            <Input
              type="password"
              autoComplete="new-password"
              value={adsAccessToken}
              disabled={removeAdsToken}
              onChange={(e) => setAdsAccessToken(e.target.value)}
              placeholder={destination.adsAccessTokenConfigured
                ? 'Токен сохранён — оставьте пустым, чтобы не менять'
                : 'Токен с правом ads_read и доступом к кабинету'}
            />
          </Field>
          <p className="text-xs text-slate-500">
            Используется только для отчётов. Отправка конверсий использует основной токен.
            Если отдельный токен не задан, статистика также запрашивается с основным токеном.
          </p>
          {destination.adsAccessTokenConfigured && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={removeAdsToken}
                onChange={(e) => setRemoveAdsToken(e.target.checked)}
              />
              Удалить отдельный токен статистики
            </label>
          )}
        </div>
      )}

      {guide.hasTestCode && (
        <div>
          <Field label="Test Event Code для всех событий (необязательно)">
            <Input
              value={form.testEventCode}
              onChange={(e) => setForm({ ...form, testEventCode: e.target.value })}
            />
          </Field>
          <p className="mt-2 text-xs text-amber-700">
            Пока код указан, события из CRM отправляются в тестовом режиме. Для рабочего
            направления оставьте поле пустым; для разовой проверки используйте «Тестовое событие».
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
