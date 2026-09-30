import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setReturnUrl,
} from './authStorage';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

type ApiEnvelope<T> = {
  status: string;
  message: string;
  statusCode: number;
  data: T;
};

type RefreshResponse = {
  accessToken: string;
};

export { getAccessToken, setAccessToken, clearAuthTokens as clearAccessToken } from './authStorage';
export { setAuthTokens } from './authStorage';

function unwrapEnvelope<T>(json: unknown): T {
  if (
    json &&
    typeof json === 'object' &&
    'data' in json &&
    'status' in json
  ) {
    return (json as ApiEnvelope<T>).data;
  }
  return json as T;
}

function formatApiError(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as { message?: string };
    if (json.message) {
      return json.message;
    }
  } catch {
    /* plain text */
  }
  return text || `Request failed (${status})`;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${refresh}` },
      });
      const text = await res.text();
      if (!res.ok) {
        return null;
      }
      const data = unwrapEnvelope<RefreshResponse>(JSON.parse(text));
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Call once on app load to restore session without re-login. */
export async function ensureAuth(): Promise<boolean> {
  if (getAccessToken()) return true;
  const token = await refreshAccessToken();
  return Boolean(token);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();

  if (res.status === 401 && !retried) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, options, true);
    }
    if (typeof window !== 'undefined') {
      setReturnUrl(window.location.pathname + window.location.search);
    }
    clearAuthTokens();
  }

  if (!res.ok) {
    throw new Error(formatApiError(text, res.status));
  }
  if (!text) {
    return undefined as T;
  }
  return unwrapEnvelope<T>(JSON.parse(text));
}
