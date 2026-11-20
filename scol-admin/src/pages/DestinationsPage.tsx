import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';
import type { DestinationItem } from '../lib/batches';

export type { DestinationItem } from '../lib/batches';

export function DestinationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DestinationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DestinationItem[]>('/data-entry/destinations')
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load destinations';
        setError(msg);
        setLoading(false);
        if (msg.toLowerCase().includes('session') || msg.includes('401')) {
          navigate('/login');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (loading) {
    return (
      <AdminShell>
        <LoadingSplash
          title="Loading destinations"
          subtitle="Reading countries from the database…"
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Destinations</h1>
        <p className="mt-1 text-sm font-bold text-slate-600">
          Pick a country, then upload a university or course CSV.
        </p>
      </header>
      {error && <p className="mb-4 text-sm font-bold text-red-600">{error}</p>}
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.sysCountryId}>
            <Link
              to={`/destinations/${c.sysCountryId}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Globe className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                <div>
                  <p className="font-bold text-slate-900">{c.countryName}</p>
                  <p className="text-sm font-bold text-slate-500">
                    {c.countryCode ?? '—'} · {c.batchCount} batches
                    {c.readyCount > 0 ? ` · ${c.readyCount} ready` : ''}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-slate-700">Open</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="font-bold text-slate-600">
          No countries yet. Run{' '}
          <code className="text-xs">npm run seed:destinations</code> to seed
          United Kingdom, Australia, Germany, and New Zealand.
        </p>
      )}
    </div>
    </AdminShell>
  );
}
