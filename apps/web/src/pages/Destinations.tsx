import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Destination } from '../lib/types';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import DestinationWizard from '../components/DestinationWizard';
import DestinationEditor from '../components/DestinationEditor';
import DestinationTest from '../components/DestinationTest';

export default function Destinations() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  /** id направления, открытого на редактирование. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setDestinations(await api<Destination[]>('/destinations'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (d: Destination) => {
    await api(`/destinations/${d.id}`, { method: 'PATCH', body: { isActive: !d.isActive } });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить направление? Связанные маппинги тоже удалятся.')) return;
    if (editingId === id) setEditingId(null);
    await api(`/destinations/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Направления"
        action={
          <Button onClick={() => setShowWizard(!showWizard)}>
            {showWizard ? 'Закрыть мастер' : '+ Добавить направление'}
          </Button>
        }
      />

      {notice && <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}

      {showWizard && (
        <div className="mb-6">
          <DestinationWizard
            onDone={() => {
              setShowWizard(false);
              void load();
            }}
          />
        </div>
      )}

      <div className="space-y-4">
        {destinations.length === 0 && !showWizard && (
          <Card>
            <p className="text-sm text-slate-500">
              Добавьте Meta Pixel или TikTok, чтобы платформа знала, куда отправлять конверсии.
            </p>
          </Card>
        )}
        {destinations.map((d) => (
          <Card key={d.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">{d.name}</span>
                <Badge value={d.type} />
                {!d.isActive && <Badge value="SKIPPED" />}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => {
                  setEditingId(null);
                  setTestingId(testingId === d.id ? null : d.id);
                }}>
                  {testingId === d.id ? 'Закрыть проверку' : 'Тестовое событие'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNotice('');
                    setTestingId(null);
                    setEditingId(editingId === d.id ? null : d.id);
                  }}
                >
                  {editingId === d.id ? 'Закрыть' : 'Изменить'}
                </Button>
                <Button variant="secondary" onClick={() => toggle(d)}>
                  {d.isActive ? 'Отключить' : 'Включить'}
                </Button>
                <Button variant="danger" onClick={() => remove(d.id)}>
                  Удалить
                </Button>
              </div>
            </div>
            <div className="mt-2 text-sm text-slate-500">
              Pixel: <code className="rounded bg-slate-100 px-1">{d.pixelId}</code> · Токен:{' '}
              {d.accessTokenMasked}
              {d.testEventCode && <> · Тестовый режим: {d.testEventCode} (все события из CRM)</>}
            </div>
            {testingId === d.id && <DestinationTest key={d.id} destination={d} />}
            {editingId === d.id && (
              <DestinationEditor
                destination={d}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  setNotice('Направление обновлено');
                  void load();
                }}
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
