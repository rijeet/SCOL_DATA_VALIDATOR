import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch, ensureAuth, getAccessToken, setAuthTokens } from '../lib/api';
import {
  getWorkSession,
  workSessionPath,
} from '../lib/workSession';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await ensureAuth();
      if (cancelled) return;
      if (ok || getAccessToken()) {
        const session = getWorkSession();
        if (session) {
          navigate(workSessionPath(session), { replace: true });
        } else {
          navigate('/universities', { replace: true });
        }
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthTokens(data.accessToken, data.refreshToken);

      const from = (location.state as { from?: string } | null)?.from;
      if (from && from.startsWith('/work/')) {
        navigate(from, { replace: true });
        return;
      }

      const session = getWorkSession();
      if (session) {
        navigate(workSessionPath(session), { replace: true });
      } else {
        navigate('/universities', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold">SCOL Data Admin</h1>
        <label className="block text-sm">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
