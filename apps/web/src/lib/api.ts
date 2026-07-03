const TOKEN_KEY = 'capi_token';
const WORKSPACE_KEY = 'capi_workspace';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getWorkspaceId(): string | null {
  return localStorage.getItem(WORKSPACE_KEY);
}

export function setWorkspaceId(id: string | null) {
  if (id) localStorage.setItem(WORKSPACE_KEY, id);
  else localStorage.removeItem(WORKSPACE_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  const workspaceId = getWorkspaceId();
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new ApiError(message ?? `Ошибка ${res.status}`, res.status);
  }
  return data as T;
}
