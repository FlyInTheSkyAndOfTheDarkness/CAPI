import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Connection, Destination, Mapping, PipelineOption, Pipelines } from '../lib/types';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';

const EVENT_NAMES = ['Lead', 'Purchase', 'CompleteRegistration', 'Schedule', 'Contact', 'SubmitForm'];

interface FormState {
  connectionId: string;
  destinationId: string;
  entityType: string;
  pipelineId: string;
  pipelineName: string;
  /** Этапы, выбранные из выпадающих списков CRM. */
  statusIds: string[];
  /** Этапы, введённые вручную (через запятую) — когда воронки не загрузились. */
  statusText: string;
  eventName: string;
  sendValue: boolean;
  currency: string;
}

const EMPTY_FORM: FormState = {
  connectionId: '',
  destinationId: '',
  entityType: 'lead',
  pipelineId: '',
  pipelineName: '',
  statusIds: [],
  statusText: '',
  eventName: 'Lead',
  sendValue: false,
  currency: 'RUB',
};

function formFromMapping(m: Mapping): FormState {
  return {
    connectionId: m.connection.id,
    destinationId: m.destination.id,
    entityType: m.entityType,
    pipelineId: m.pipelineId ?? '',
    pipelineName: m.pipelineName ?? '',
    statusIds: [m.statusId],
    statusText: m.statusId,
    eventName: m.eventName,
    sendValue: m.sendValue,
    currency: m.currency,
  };
}

export default function Mappings() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [showForm, setShowForm] = useState(false);
  /** Редактируемый маппинг; null — режим создания. */
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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
  // У лидов Битрикс24 воронок нет — приходит одна псевдо-воронка с пустым id.
  // Выбирать нечего, поэтому селект воронки прячем и сразу показываем этапы.
  const noPipelineChoice = pipelineList.length === 1 && pipelineList[0].id === '';

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  };

  const openEdit = (m: Mapping) => {
    setEditing(m);
    setForm(formFromMapping(m));
    setError('');
    setNotice('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  /** Выбранные этапы с названиями — из списка CRM или из ручного ввода. */
  const chosenStatuses = (): Array<{ id: string; name?: string }> => {
    if (manualMode) {
      return form.statusText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((id) => ({ id }));
    }
    return form.statusIds.map((id) => ({
      id,
      name: selectedPipeline?.statuses.find((s) => s.id === id)?.name,
    }));
  };

  const toggleStatus = (id: string) => {
    setForm((f) => {
      // При редактировании этап всегда ровно один
      if (editing) return { ...f, statusIds: [id] };
      return {
        ...f,
        statusIds: f.statusIds.includes(id)
          ? f.statusIds.filter((s) => s !== id)
          : [...f.statusIds, id],
      };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const statuses = chosenStatuses();
    if (statuses.length === 0) {
      setError('Выберите хотя бы один этап воронки');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api(`/mappings/${editing.id}`, {
          method: 'PATCH',
          body: {
            connectionId: form.connectionId,
            destinationId: form.destinationId,
            entityType: form.entityType,
            pipelineId: form.pipelineId,
            pipelineName: form.pipelineName,
            statusId: statuses[0].id,
            // В ручном режиме названия этапа нет — сохраняем прежнее, если этап тот же
            statusName:
              statuses[0].name ??
              (statuses[0].id === editing.statusId ? (editing.statusName ?? '') : ''),
            eventName: form.eventName,
            sendValue: form.sendValue,
            currency: form.currency,
          },
        });
        setNotice('Маппинг обновлён');
      } else {
        const created = await api<Mapping[]>('/mappings', {
          method: 'POST',
          body: {
            connectionId: form.connectionId,
            destinationId: form.destinationId,
            entityType: form.entityType,
            pipelineId: form.pipelineId || undefined,
            pipelineName: form.pipelineName || undefined,
            statuses,
            eventName: form.eventName,
            sendValue: form.sendValue,
            currency: form.currency,
          },
        });
        const skipped = statuses.length - created.length;
        setNotice(
          skipped > 0
            ? `Создано маппингов: ${created.length}. Пропущено уже существующих: ${skipped}.`
            : `Создано маппингов: ${created.length}.`,
        );
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (m: Mapping) => {
    await api(`/mappings/${m.id}`, { method: 'PATCH', body: { isActive: !m.isActive } });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить маппинг?')) return;
    if (editing?.id === id) closeForm();
    await api(`/mappings/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Маппинг событий"
        action={
          <Button
            onClick={() => (showForm ? closeForm() : openCreate())}
            disabled={!connections.length || !destinations.length}
          >
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
      {notice && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>
      )}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 font-semibold text-slate-900">
            {editing ? 'Изменение маппинга' : 'Новый маппинг'}
          </h2>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
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
                    statusIds: [],
                    statusText: '',
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
                    statusIds: [],
                    statusText: '',
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
                {noPipelineChoice ? (
                  <Field label="Воронка">
                    <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500">
                      У лидов воронок нет — правило сработает на любом лиде.
                    </p>
                  </Field>
                ) : (
                  <Field label="Воронка">
                    <Select
                      value={form.pipelineId}
                      onChange={(e) => {
                        const p = pipelineList.find((x) => x.id === e.target.value);
                        setForm({
                          ...form,
                          pipelineId: e.target.value,
                          pipelineName: p?.name ?? '',
                          statusIds: [],
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
                )}

                <div className="md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {editing ? 'Этап (статус)' : 'Этапы (статусы) — можно выбрать несколько'}
                  </span>
                  {!selectedPipeline ? (
                    <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500">
                      Сначала выберите воронку.
                    </p>
                  ) : (
                    <>
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {selectedPipeline.statuses.map((s) => (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <input
                              type={editing ? 'radio' : 'checkbox'}
                              checked={form.statusIds.includes(s.id)}
                              onChange={() => toggleStatus(s.id)}
                            />
                            <span>{s.name}</span>
                            <code className="ml-auto text-xs text-slate-400">{s.id}</code>
                          </label>
                        ))}
                      </div>
                      {!editing && (
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="text-slate-500">
                            Выбрано: {form.statusIds.length}. На каждый этап создастся отдельный
                            маппинг.
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                statusIds: selectedPipeline.statuses.map((s) => s.id),
                              })
                            }
                            className="font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            Выбрать все
                          </button>
                          {form.statusIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, statusIds: [] })}
                              className="font-medium text-slate-500 hover:text-slate-900"
                            >
                              Снять
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
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
                <div className="md:col-span-2">
                  <Field
                    label={
                      selectedConnection?.type === 'BITRIX24'
                        ? 'ID этапов (STAGE_ID)'
                        : 'ID этапов (status_id)'
                    }
                  >
                    <Input
                      value={form.statusText}
                      onChange={(e) => setForm({ ...form, statusText: e.target.value })}
                      placeholder={editing ? 'C1:WON' : 'C1:WON, C1:NEW — можно несколько через запятую'}
                      required
                    />
                  </Field>
                  {!editing && (
                    <p className="mt-1 text-xs text-slate-500">
                      Несколько ID через запятую — на каждый создастся отдельный маппинг.
                    </p>
                  )}
                </div>
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
            <Field label="Валюта (KZT, USD, EUR, RUB)">
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                placeholder="KZT"
                pattern="[A-Z]{3}"
                maxLength={3}
                required
                title="Укажите трёхбуквенный код валюты ISO 4217, например KZT."
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
            <div className="flex gap-2 md:col-span-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Создать маппинг'}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm}>
                Отмена
              </Button>
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
                  <tr
                    key={m.id}
                    className={`border-b border-slate-100 ${!m.isActive ? 'opacity-50' : ''} ${
                      editing?.id === m.id ? 'bg-indigo-50/60' : ''
                    }`}
                  >
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
                        onClick={() => openEdit(m)}
                        className="mr-3 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Изменить
                      </button>
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
