import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'Дашборд' },
  { to: '/analytics', label: 'Аналитика' },
  { to: '/connections', label: 'Подключения CRM' },
  { to: '/destinations', label: 'Направления' },
  { to: '/mappings', label: 'Маппинг событий' },
  { to: '/logs', label: 'Логи доставки' },
  { to: '/alerts', label: 'Уведомления' },
];

export default function Layout() {
  const { me, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-bold text-slate-900">CAPI</div>
          <div className="truncate text-xs text-slate-500">
            {me?.workspaces[0]?.name}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="mb-2 truncate text-xs text-slate-500">{me?.user.email}</div>
          <button
            onClick={logout}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-8">
        <Outlet />
      </main>
    </div>
  );
}
