import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Connection, Destination, Mapping, PipelineOption, Pipelines } from '../lib/types';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';

const EVENT_NAMES = ['Lead', 'Purchase', 'CompleteRegistration', 'Schedule', 'Contact', 'SubmitForm'];

const EMPTY_FORM = {
  connectionId: '',
  destinationId: '',
  entityType: 'lead',
  pipelineId: '',
  pipelineName: '',
  statusId: '',
  statusName: '',
  eventName: 'Lead',
  sendValue: false,
  currency: 'RUB',
};

export default function Mappings() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  // Воронки/этапы выбранного подключения
  const [pipelines, setPipelines] = useState<Pipelines | null>(null);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelinesError, setPipelinesError] = useState('');

  const load = useCallback(async () => {
    const [m, c, d] = await Promise.all([
      api<Mapping[]>('/mappings'),
      api<Connection[]>('/connections'),
      api<Destination[]>('/destinations'),
    ]);
    setMappings(m);
    setConnections(c);
    setDestinations(d);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedConnection = connections.find((c) => c.id === form.connectionId);

  // Загружаем воронки при выборе подключения
  useEffect(() => {
    if (!form.connectionId) {
      setPipelines(null);
      return;
    }
    setPipelinesLoading(true);
    setPipelinesError('');
    api<Pipelines>(`/connections/${form.connectionId}/pipelines`)
      .then(setPipelines)
      .catch((e) => {
        setPipelines(null);
        setPipelinesError(e instanceof Error ? e.message : 'Не удалось загрузить воронки');
      })
      .finally(() => setPipelinesLoading(false));
  }, [form.connectionId]);

  // Список воронок для текущего типа сущности
  const pipelineList: PipelineOption[] =
    (form.entityType === 'deal' ? pipelines?.deal : pipelines?.lead) ?? [];
  const selectedPipeline = pipelineList.find((p) => p.id === form.pipelineId);
  // Ручной режим — если воронки не загрузились (CRM не авторизована и т.п.)
  const manualMode = !pipelinesLoading && pipelineList.length === 0;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/mappings', {
        method: 'POST',
        body: {
          connectionId: form.connectionId,
          destinationId: form.destinationId,
          entityType: form.entityType,
          pipelineId: form.pipelineId || undefined,
          pipelineName: form.pipelineName || undefined,
          statusId: form.statusId,
          statusName: form.statusName || undefined,
          eventName: form.eventName,
          sendValue: form.sendValue,
          currency: form.currency,
        },
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const toggle = async (m: Mapping) => {
    await api(`/mappings/${m.id}`, { method: 'PATCH', body: { isActive: !m.isActive } });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить маппинг?')) return;
    await api(`/mappings/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Маппинг событий"
        action={
          <Button onClick={() => setShowForm(!showForm)} disabled={!connections.length || !destinations.length}>
            {showForm ? 'Отмена' : '+ Добавить маппинг'}
          </Button>
        }
      />

      {(!connections.length || !destinations.length) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Сначала добавьте хотя бы одно подключение CRM и одно направление.
        </p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={create} className="grid gap-4 md:grid-cols-3">
            <Field label="Подключение CRM">
              <Select
                value={form.connectionId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    connectionId: e.target.value,
                    entityType: 'lead',
                    pipelineId: '',
                    pipelineName: '',
                    statusId: '',
                    statusName: '',
                  })
                }
                required
              >
                <option value="">— выберите —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type === 'AMOCRM' ? 'amoCRM' : 'Битрикс24'})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Направление">
              <Select
                value={form.destinationId}
                onChange={(e) => setForm({ ...form, destinationId: e.target.value })}
                required
              >
                <option value="">— выберите —</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Сущность CRM">
              <Select
                value={form.entityType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    entityType: e.target.value,
                    pipelineId: '',
                    pipelineName: '',
                    statusId: '',
                    statusName: '',
                  })
                }
              >
                <option value="lead">Лид</option>
                {selectedConnection?.type === 'BITRIX24' && <option value="deal">Сделка</option>}
              </Select>
            </Field>

            {pipelinesLoading && (
              <p className="text-sm text-slate-500 md:col-span-3">Загружаем воронки и этапы из CRM…</p>
            )}

            {!pipelinesLoading && !manualMode && (
              <>
                <Field label="Воронка">
                  <Select
                    value={form.pipelineId}
                    onChange={(e) => {
                      const p = pipelineList.find((x) => x.id === e.target.value);
                      setForm({
                        ...form,
                        pipelineId: e.target.value,
                        pipelineName: p?.name ?? '',
                        statusId: '',
                        statusName: '',
                      });
                    }}
                    required
                  >
                    <option value="">— выберите воронку —</option>
                    {pipelineList.map((p) => (
                      <option key={p.id || p.name} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Этап (статус)">
                  <Select
                    value={form.statusId}
                    onChange={(e) => {
                      const s = selectedPipeline?.statuses.find((x) => x.id === e.target.value);
                      setForm({ ...form, statusId: e.target.value, statusName: s?.name ?? '' });
                    }}
                    required
                    disabled={!selectedPipeline}
                  >
                    <option value="">— выберите этап —</option>
                    {selectedPipeline?.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {manualMode && (
              <>
                <div className="md:col-span-3">
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    {pipelinesError
                      ? `Не удалось загрузить воронки (${pipelinesError}). Введите ID вручную или проверьте подключение.`
                      : 'Воронки не найдены — введите ID вручную.'}
                  </p>
                </div>
                <Field label={selectedConnection?.type === 'BITRIX24' ? 'ID воронки (CATEGORY_ID)' : 'ID воронки (pipeline_id)'}>
                  <Input
                    value={form.pipelineId}
                    onChange={(e) => setForm({ ...form, pipelineId: e.target.value })}
                    placeholder="пусто = любая"
                  />
                </Field>
                <Field label={selectedConnection?.type === 'BITRIX24' ? 'ID этапа (STAGE_ID)' : 'ID этапа (status_id)'}>
                  <Input
                    value={form.statusId}
                    onChange={(e) => setForm({ ...form, statusId: e.target.value })}
                    required
                  />
                </Field>
              </>
            )}

            <Field label="Событие конверсии">
              <>
                <Input
                  list="event-names"
                  value={form.eventName}
                  onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                  required
                />
                <datalist id="event-names">
                  {EVENT_NAMES.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </>
            </Field>
            <Field label="Валюта">
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.sendValue}
                onChange={(e) => setForm({ ...form, sendValue: e.target.checked })}
              />
              Передавать сумму сделки
            </label>
            <div className="md:col-span-3">
              <Button type="submit">Создать маппинг</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {mappings.length === 0 ? (
          <p className="text-sm text-slate-500">
            Маппинги определяют, какой этап воронки CRM превращается в какое событие рекламной
            платформы.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-2 py-2">CRM</th>
                  <th className="px-2 py-2">Сущность</th>
                  <th className="px-2 py-2">Воронка / этап</th>
                  <th className="px-2 py-2">Событие</th>
                  <th className="px-2 py-2">Направление</th>
                  <th className="px-2 py-2">Сумма</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className={`border-b border-slate-100 ${!m.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-2">{m.connection.name}</td>
                    <td className="px-2 py-2">{m.entityType === 'deal' ? 'Сделка' : 'Лид'}</td>
                    <td className="px-2 py-2">
                      <span className="text-slate-700">
                        {m.pipelineName ?? m.pipelineId ?? 'Любая'} → <b>{m.statusName ?? m.statusId}</b>
                      </span>
                    </td>
                    <td className="px-2 py-2 font-medium">{m.eventName}</td>
                    <td className="px-2 py-2">
                      {m.destination.name} <Badge value={m.destination.type} />
                    </td>
                    <td className="px-2 py-2">{m.sendValue ? m.currency : '—'}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => toggle(m)}
                        className="mr-3 text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        {m.isActive ? 'Выкл' : 'Вкл'}
                      </button>
                      <button
                        onClick={() => remove(m.id)}
                        className="text-xs font-medium text-red-500 hover:text-red-700"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
