import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setWorkspaceId } from './api';
import type { Me } from './types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  refresh: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<Me>('/auth/me');
      setMe(data);
      if (data.workspaces.length > 0) {
        setWorkspaceId(data.workspaces[0].id);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    setToken(null);
    setWorkspaceId(null);
    setMe(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
