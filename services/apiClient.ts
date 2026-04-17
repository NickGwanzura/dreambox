/**
 * API Client — Neon PostgreSQL via /api/* Vercel functions with JWT auth.
 * Handles token storage, 401 detection, and automatic sign-out on expiry.
 */

const TOKEN_KEY = 'db_auth_token';

export const getToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const setToken = (token: string): void => {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
};

export const clearToken = (): void => {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
};

export const isConfigured = (): boolean => !!getToken();

/**
 * Check whether a JWT has expired by inspecting its payload.
 * Returns true if expired or unparseable.
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false; // no expiry claim — treat as valid
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true; // malformed → treat as expired
  }
}

/**
 * Handle an expired / revoked session: clear token and redirect to login.
 */
function handleSessionExpired() {
  clearToken();
  // Dispatch a custom event so the auth layer can react
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}

async function request<T = any>(
  method: string,
  path: string,
  body?: any,
  params?: Record<string, string>
): Promise<T> {
  const token = getToken();

  // Pre-flight: reject early if token is expired (avoids a wasted round-trip)
  if (token && isTokenExpired(token)) {
    handleSessionExpired();
    throw new Error('Session expired. Please sign in again.');
  }

  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  // Handle 401 — token rejected by server
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T = any>(path: string, params?: Record<string, string>) =>
    request<T>('GET', path, undefined, params),
  post: <T = any>(path: string, body: any) => request<T>('POST', path, body),
  put: <T = any>(path: string, body: any, params?: Record<string, string>) =>
    request<T>('PUT', path, body, params),
  delete: <T = any>(path: string, params?: Record<string, string>) =>
    request<T>('DELETE', path, undefined, params),
};

export const checkConnection = async (): Promise<boolean> => {
  try {
    await api.get('/api/auth/me');
    return true;
  } catch {
    return false;
  }
};
