import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Connections from './pages/Connections';
import Destinations from './pages/Destinations';
import Mappings from './pages/Mappings';
import Logs from './pages/Logs';
import Alerts from './pages/Alerts';
import Users from './pages/Users';

export default function App() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Загрузка…
      </div>
    );
  }

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const role = me.workspaces[0]?.role;

  // Наблюдатель: единственная доступная страница — аналитика по своим маппингам
  if (role === 'VIEWER') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/analytics" element={<Analytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/analytics" replace />} />
      </Routes>
    );
  }

  const canManageUsers = role === 'OWNER' || role === 'ADMIN';

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/mappings" element={<Mappings />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/alerts" element={<Alerts />} />
        {canManageUsers && <Route path="/users" element={<Users />} />}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
