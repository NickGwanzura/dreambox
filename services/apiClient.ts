/**
 * API Client — application PostgreSQL via /api/* deployment platform functions with JWT auth.
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
 * Decode a base64url segment (JWT-style) into a UTF-8 string.
 * atob() only handles standard base64, so we normalise padding and charset first.
 */
function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    segment.length + ((4 - (segment.length % 4)) % 4),
    '='
  );
  return atob(padded);
}

/**
 * Check whether a JWT has expired by inspecting its payload.
 * Returns false on unparseable tokens — the server is the source of truth; let it decide.
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1] ?? ''));
    if (!payload.exp) return false; // no expiry claim — treat as valid
    return Date.now() >= payload.exp * 1000;
  } catch {
    return false; // can't tell locally — let the server respond
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

  // Handle 401 — only treat as expired session if we actually sent a token.
  // Unauthenticated requests (signin, signup, password reset) must surface the
  // server's real error message (e.g. "Invalid email or password").
  if (res.status === 401) {
    const err = await res.json().catch(() => ({ error: 'Unauthorized' }));
    if (token) {
      handleSessionExpired();
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(err.error || 'Invalid email or password');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // The backend marks maintenance with 503 + X-Maintenance — flip the whole
    // app to the maintenance screen (App.tsx listens for this event).
    if (res.status === 503 && res.headers.get('x-maintenance')) {
      window.dispatchEvent(new Event('app:maintenance'));
      throw new Error(err.error || 'Platform is under maintenance');
    }
    // Validation failures come back as { error, details: [...] } — surface the
    // details so the user sees exactly which field failed (e.g. "Amount must be
    // positive") instead of a generic "Validation failed".
    const reason = Array.isArray(err.details) && err.details.length
      ? `${err.error || 'Validation failed'}: ${err.details.join('; ')}`
      : (err.error || `HTTP ${res.status}`);
    const error = new Error(reason);
    (error as any).status = res.status;
    throw error;
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
