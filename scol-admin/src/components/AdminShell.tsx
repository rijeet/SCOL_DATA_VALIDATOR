import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, clearAccessToken } from '../lib/api';
import { clearWorkSession } from '../lib/workSession';
import type { DestinationItem } from '../lib/batches';

type Props = {
  children: ReactNode;
};

export function AdminShell({ children }: Props) {
  const navigate = useNavigate();
  const [destinations, setDestinations] = useState<DestinationItem[]>([]);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DestinationItem[]>('/data-entry/destinations')
      .then((data) => {
        if (!cancelled) setDestinations(data);
      })
      .catch(() => {
        if (!cancelled) setDestinations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function logout() {
    clearWorkSession();
    clearAccessToken();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800 hover:text-slate-950"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              Dashboard
            </Link>
            <Link
              to="/unpublished"
              className="text-sm font-bold text-slate-700 hover:text-slate-950"
            >
              Unpublished
            </Link>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-bold text-slate-700 hover:text-slate-950"
              >
                Destinations
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
              {open && (
                <div className="absolute left-0 z-40 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <Link
                    to="/destinations"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    All destinations
                  </Link>
                  {destinations.map((d) => (
                    <Link
                      key={d.sysCountryId}
                      to={`/destinations/${d.sysCountryId}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {d.countryName}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>
      </nav>
      {children}
    </div>
  );
}
