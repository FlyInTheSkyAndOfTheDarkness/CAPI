import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Mapping, Member } from '../lib/types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

function mappingLabel(m: Mapping): string {
  const stage = m.statusName ?? m.statusId;
  const pipe = m.pipelineName ? `${m.pipelineName} · ` : '';
  return `${m.connection.name}: ${pipe}${stage} → ${m.eventName} (${m.destination.name})`;
}

/** Список маппингов с чекбоксами. */
function MappingChecklist({
  mappings,
  selected,
  onToggle,
}: {
  mappings: Mapping[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (mappings.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
        Сначала создайте маппинги событий — тогда их можно будет выдать наблюдателю.
      </p>
    );
  }
  return (
    <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
      {mappings.map((m) => (
        <label
          key={m.id}
          className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={() => onToggle(m.id)}
            className="mt-0.5"
          />
          <span className="text-slate-700">{mappingLabel(m)}</span>
        </label>
      ))}
    </div>
  );
}

/** Одна строка наблюдателя с возможностью изменить доступ/пароль и удалить. */
function MemberRow({
  member,
  mappings,
  onChanged,
}: {
  member: Member;
  mappings: Mapping[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(member.mappingIds);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byId = new Map(mappings.map((m) => [m.id, m]));
  const missing = member.mappingIds.filter((id) => !byId.has(id)).length;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const startEdit = () => {
    setSelected(member.mappingIds);
    setPassword('');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/members/${member.id}`, {
        method: 'PATCH',
        body: { mappingIds: selected, ...(password ? { password } : {}) },
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Удалить доступ и аккаунт ${member.email}?`)) return;
    setBusy(true);
    try {
      await api(`/members/${member.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-900">
            {member.name || member.email}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Наблюдатель
            </span>
          </div>
          {member.name && <div className="text-sm text-slate-500">{member.email}</div>}
          <div className="mt-1 text-sm text-slate-500">
            Доступ к маппингам: <b>{member.mappingIds.length}</b>
            {missing > 0 && (
              <span className="text-amber-600"> (из них удалено: {missing})</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={editing ? () => setEditing(false) : startEdit}>
            {editing ? 'Отмена' : 'Изменить доступ'}
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            Удалить
          </Button>
        </div>
      </div>

      {!editing && member.mappingIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {member.mappingIds.map((id) => {
            const m = byId.get(id);
            return (
              <span
                key={id}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
              >
                {m ? mappingLabel(m) : 'удалённый маппинг'}
              </span>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <Field label="Разрешённые маппинги (аналитика)">
            <MappingChecklist mappings={mappings} selected={selected} onToggle={toggle} />
          </Field>
          <Field label="Новый пароль (необязательно, минимум 8 символов)">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Оставьте пустым, чтобы не менять"
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || (!!password && password.length < 8)}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}

      {!editing && error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

export default function Users() {
  const [members, setMembers] = useState<Member[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ms, mp] = await Promise.all([
        api<Member[]>('/members'),
        api<Mapping[]>('/mappings'),
      ]);
      setMembers(ms);
      setMappings(mp);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api<Member>('/members', {
        method: 'POST',
        body: {
          email: form.email,
          password: form.password,
          name: form.name || undefined,
          mappingIds: selected,
        },
      });
      setForm({ email: '', password: '', name: '' });
      setSelected([]);
      setNotice('Аккаунт наблюдателя создан. Передайте ему email и пароль для входа.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать аккаунт');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Пользователи" />
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        Создавайте аккаунты для сотрудников и подрядчиков с доступом только к аналитике
        выбранных маппингов. Такой пользователь видит лишь страницу «Аналитика» и ничего не
        может менять.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Форма создания */}
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">Новый наблюдатель</h2>
          <form onSubmit={create} className="space-y-4">
            <Field label="Email (логин)">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="viewer@company.ru"
                required
              />
            </Field>
            <Field label="Имя (необязательно)">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Иван, маркетолог"
              />
            </Field>
            <Field label="Пароль (минимум 8 символов)">
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Придумайте и передайте сотруднику"
                minLength={8}
                required
              />
            </Field>
            <Field label="Доступные маппинги (аналитика)">
              <MappingChecklist mappings={mappings} selected={selected} onToggle={toggle} />
            </Field>
            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
            )}
            {notice && (
              <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>
            )}
            <Button type="submit" disabled={busy || form.password.length < 8}>
              {busy ? 'Создаём…' : 'Создать аккаунт'}
            </Button>
          </form>
        </Card>

        {/* Список наблюдателей */}
        <div className="space-y-4">
          <h2 className="font-semibold text-slate-900">Наблюдатели</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Загрузка…</p>
          ) : members.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">
                Пока нет наблюдателей. Создайте первого в форме слева.
              </p>
            </Card>
          ) : (
            members.map((m) => (
              <MemberRow key={m.id} member={m} mappings={mappings} onChanged={load} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
