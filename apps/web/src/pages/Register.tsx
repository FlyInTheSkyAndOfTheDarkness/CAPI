import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';

export default function Register() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/auth/register', {
        method: 'POST',
        body: { email, password, name: name || undefined },
      });
      setToken(token);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Регистрация</h1>
        <p className="mb-6 text-sm text-slate-500">Создайте аккаунт CAPI</p>
        <div className="space-y-4">
          <Field label="Имя">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Пароль (мин. 8 символов)">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Создаём…' : 'Создать аккаунт'}
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-800">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}
