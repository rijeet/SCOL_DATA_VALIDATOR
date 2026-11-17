import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CloudDownload, LogOut, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch, clearAccessToken } from '../lib/api';
import { resolveInitialRowIndex } from '../lib/initialWorkRow';
import { clearWorkSession, setWorkSession } from '../lib/workSession';

/** Route of the university list page (back link). Change if your route differs. */
const UNIVERSITIES_PATH = '/destinations';

type StagingSummary = {
  batchId: string;
  rowCount: number;
  invalidRowCount: number;
  validRowCount: number;
  status: string;
  publishedAt?: string | null;
};

type UniversityListItem = {
  sysUniversityId: string;
  uniName: string;
  staging?: StagingSummary | null;
};

type BatchCreateResponse = {
  batchId: string;
  rowCount: number;
  invalidRowCount: number;
};

export function ReimportPage() {
  const navigate = useNavigate();
  const [universities, setUniversities] = useState<UniversityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UniversityListItem[]>('/data-entry/universities')
      .then((data) => {
        if (cancelled) return;
        setUniversities(data.filter((u) => u.staging));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load universities';
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return universities;
    return universities.filter((u) => u.uniName.toLowerCase().includes(q));
  }, [universities, search]);

  async function reimport(uni: UniversityListItem) {
    setBusyId(uni.sysUniversityId);
    setConfirmId(null);
    setError(null);
    try {
      const res = await apiFetch<BatchCreateResponse>(
        '/data-entry/batches?replaceExisting=true',
        {
          method: 'POST',
          body: JSON.stringify({ sysUniversityId: uni.sysUniversityId }),
        },
      );
      const rowIndex = await resolveInitialRowIndex(res.batchId, {
        rowCount: res.rowCount,
        invalidRowCount: res.invalidRowCount,
      });
      setWorkSession({
        batchId: res.batchId,
        rowIndex,
        universityKey: uni.uniName,
        rowCount: res.rowCount,
      });
      navigate(`/work/${res.batchId}/rows/${rowIndex}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-import failed');
      setBusyId(null);
    }
  }

  function logout() {
    clearWorkSession();
    clearAccessToken();
    navigate('/login');
  }

  if (loading) {
    return (
      <LoadingSplash
        title="Loading universities"
        subtitle="Reading universities with staging data…"
      />
    );
  }

  if (busyId) {
    const name = universities.find((u) => u.sysUniversityId === busyId)?.uniName;
    return (
      <LoadingSplash
        title="Re-importing courses"
        subtitle={`Cloudinary → staging DB for ${name ?? 'university'}…`}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            to={UNIVERSITIES_PATH}
            className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to universities
          </Link>
          <h1 className="text-2xl font-bold">Re-import from Cloudinary</h1>
          <p className="mt-1 text-sm font-bold text-slate-600">
            Replace the staging data of a university with a fresh copy from
            Cloudinary.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Log out
        </button>
      </header>

      <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
        <p className="text-sm font-bold text-amber-900">
          Re-importing creates a new batch from the Cloudinary CSV. Edits you made
          in the current batch will no longer be shown.
        </p>
      </section>

      {error && <p className="mb-4 text-sm font-bold text-red-600">{error}</p>}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search university"
        className="mb-4 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold"
      />

      <ul className="space-y-3">
        {filtered.map((u) => {
          const staging = u.staging!;
          const published = staging.status === 'PUBLISHED';
          const confirming = confirmId === u.sysUniversityId;
          return (
            <li
              key={u.sysUniversityId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{u.uniName}</p>
                <p className="text-sm font-bold text-slate-500">
                  {staging.rowCount} courses · {staging.validRowCount} valid ·{' '}
                  {staging.invalidRowCount} to fix
                </p>
                {published && (
                  <p className="mt-1 text-xs font-bold text-emerald-800">
                    Catalog is live. After re-importing, publish again to update
                    the catalog.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {confirming ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void reimport(u)}
                      className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-2 text-sm font-bold text-white"
                    >
                      <CloudDownload className="h-4 w-4" aria-hidden />
                      Confirm re-import
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(u.sysUniversityId)}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Re-import
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && (
        <p className="font-bold text-slate-600">
          {universities.length === 0
            ? 'No university has staging data yet. Import one from the university list first.'
            : 'No university matches your search.'}
        </p>
      )}
    </div>
  );
}
