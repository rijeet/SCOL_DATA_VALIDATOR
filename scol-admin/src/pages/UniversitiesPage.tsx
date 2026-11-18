import { useEffect, useRef, useState } from 'react';
import {
  CloudDownload,
  CloudUpload,
  Download,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch, clearAccessToken } from '../lib/api';
import { applyFilledCsv } from '../lib/applyFilledCsv';
import { exportBatchCsv } from '../lib/exportBatchCsv';
import { resolveInitialRowIndex } from '../lib/initialWorkRow';
import { clearWorkSession, setWorkSession } from '../lib/workSession';

type StagingSummary = {
  batchId: string;
  rowCount: number;
  invalidRowCount: number;
  validRowCount: number;
  status: string;
  publishedAt?: string | null;
};

function stagingStatusLabel(staging: StagingSummary): string {
  if (staging.status === 'PUBLISHED') {
    const when = staging.publishedAt
      ? new Date(staging.publishedAt).toLocaleDateString()
      : '';
    return when ? `Published ${when}` : 'Published';
  }
  if (staging.status === 'VALIDATED' || staging.invalidRowCount === 0) {
    return 'Ready to publish';
  }
  return `${staging.invalidRowCount} to fix`;
}

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

export function UniversitiesPage() {
  const navigate = useNavigate();
  const [universities, setUniversities] = useState<UniversityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    'import' | 'continue' | 'sync' | 'export' | 'export-fix' | 'apply' | null
  >(null);
  const filledInputRef = useRef<HTMLInputElement>(null);
  const applyUniRef = useRef<UniversityListItem | null>(null);
  const [applyNote, setApplyNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UniversityListItem[]>('/data-entry/universities')
      .then((data) => {
        if (cancelled) return;
        setUniversities(data);
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

  async function openRowEditor(
    uni: UniversityListItem,
    batchId: string,
    rowCount: number,
    invalidRowCount?: number,
  ) {
    const rowIndex = await resolveInitialRowIndex(batchId, {
      rowCount,
      invalidRowCount: invalidRowCount ?? 0,
    });
    setWorkSession({
      batchId,
      rowIndex,
      universityKey: uni.uniName,
      rowCount,
    });
    navigate(`/work/${batchId}/rows/${rowIndex}`);
  }

  async function continueValidation(uni: UniversityListItem) {
    const staging = uni.staging;
    if (!staging) return;
    setBusyId(uni.sysUniversityId);
    setBusyAction('continue');
    setError(null);
    try {
      await openRowEditor(
        uni,
        staging.batchId,
        staging.rowCount,
        staging.invalidRowCount,
      );
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function importFromCloud(uni: UniversityListItem) {
    setBusyId(uni.sysUniversityId);
    setBusyAction('import');
    setError(null);
    try {
      const res = await apiFetch<BatchCreateResponse>('/data-entry/batches', {
        method: 'POST',
        body: JSON.stringify({ sysUniversityId: uni.sysUniversityId }),
      });
      setUniversities((prev) =>
        prev.map((u) =>
          u.sysUniversityId === uni.sysUniversityId
            ? {
                ...u,
                staging: {
                  batchId: res.batchId,
                  rowCount: res.rowCount,
                  invalidRowCount: res.invalidRowCount,
                  validRowCount: Math.max(0, res.rowCount - res.invalidRowCount),
                  status: 'READY',
                  publishedAt: null,
                },
              }
            : u,
        ),
      );
      await openRowEditor(uni, res.batchId, res.rowCount, res.invalidRowCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function exportCourses(uni: UniversityListItem, format?: 'data-fix') {
    const staging = uni.staging;
    if (!staging) return;
    setBusyId(uni.sysUniversityId);
    setBusyAction(format === 'data-fix' ? 'export-fix' : 'export');
    setError(null);
    try {
      await exportBatchCsv(staging.batchId, uni.uniName, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  function pickFilledCsv(uni: UniversityListItem) {
    applyUniRef.current = uni;
    filledInputRef.current?.click();
  }

  async function onFilledFile(file: File | undefined) {
    const uni = applyUniRef.current;
    applyUniRef.current = null;
    const batchId = uni?.staging?.batchId;
    if (!file || !uni || !batchId) return;
    setBusyId(uni.sysUniversityId);
    setBusyAction('apply');
    setError(null);
    setApplyNote(null);
    try {
      const res = await applyFilledCsv(batchId, file);
      const skip = res.skipped.length
        ? ` ${res.skipped.length} skipped.`
        : '';
      setApplyNote(
        `Updated ${res.updated} staging rows, ${res.catalogUpdated} catalog.${skip}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply filled CSV failed');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function syncFromCloudinary() {
    setBusyId('sync');
    setBusyAction('sync');
    setError(null);
    try {
      const res = await apiFetch<{ created: string[]; skipped: number }>(
        '/data-entry/universities/sync-from-cloud',
        { method: 'POST', body: JSON.stringify({}) },
      );
      const data = await apiFetch<UniversityListItem[]>('/data-entry/universities');
      setUniversities(data);
      if (res.created.length === 0) {
        setError(
          res.skipped > 0
            ? 'No new universities to add (names already in database or Cloudinary list empty).'
            : 'Cloudinary returned no university folders. Check SCOL_DATA and API limits.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync from Cloudinary failed');
    } finally {
      setBusyId(null);
      setBusyAction(null);
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
        subtitle="Reading sys_Universities from database…"
      />
    );
  }

  if (busyId && busyAction === 'sync') {
    return (
      <LoadingSplash
        title="Syncing universities"
        subtitle="Creating sys_Universities rows from Cloudinary folder names…"
      />
    );
  }

  if (busyId && busyAction === 'import') {
    const name = universities.find((u) => u.sysUniversityId === busyId)?.uniName;
    return (
      <LoadingSplash
        title="Importing courses"
        subtitle={`Cloudinary → staging DB for ${name ?? 'university'}…`}
      />
    );
  }

  if (busyId && busyAction === 'apply') {
    const name = universities.find((u) => u.sysUniversityId === busyId)?.uniName;
    return (
      <LoadingSplash
        title="Applying filled CSV"
        subtitle={`Updating RowEditor and catalog for ${name ?? 'university'}…`}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Choose university</h1>
          <p className="mt-1 text-sm font-bold text-slate-600">
            List from database. Import from Cloudinary only when you need course
            rows in staging.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/reimport"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Re-import
          </Link>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>
      </header>
      {error && <p className="mb-4 text-sm font-bold text-red-600">{error}</p>}
      {applyNote && (
        <p className="mb-4 text-sm font-bold text-emerald-700">{applyNote}</p>
      )}
      <input
        ref={filledInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void onFilledFile(file);
        }}
      />

      <section className="mb-6 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-sky-900">
          Optional — Cloudinary
        </h2>
        <p className="mt-1 text-sm font-bold text-sky-950/80">
          Step 1: pull university <strong>names</strong> from{' '}
          <code className="text-xs">SCOL_DATA</code> into the database. Step 2: use{' '}
          <strong>Import Cloudinary</strong> on a row to load course CSV into staging.
        </p>
        <button
          type="button"
          disabled={Boolean(busyId)}
          onClick={() => syncFromCloudinary()}
          className="mt-3 inline-flex items-center gap-1.5 rounded bg-sky-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          <CloudDownload className="h-4 w-4" aria-hidden />
          Sync university names from Cloudinary
        </button>
        <p className="mt-2 text-xs font-bold text-sky-900/70">
          If you see &quot;Internal server error&quot;, run{' '}
          <code className="text-[11px]">npm run typeorm:run</code> in scol-backend
          (creates sys_Universities).
        </p>
      </section>

      <ul className="space-y-3">
        {universities.map((u) => {
          const staging = u.staging;
          const busy = busyId === u.sysUniversityId;
          return (
            <li
              key={u.sysUniversityId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <FileSpreadsheet
                  className="mt-0.5 h-5 w-5 shrink-0 text-slate-500"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{u.uniName}</p>
                  <p className="text-sm font-bold text-slate-500">
                    {staging
                      ? `Staging: ${staging.rowCount} courses · ${staging.validRowCount} valid · ${stagingStatusLabel(staging)}`
                      : 'No staging data yet — optional Cloudinary import'}
                  </p>
                  {staging?.status === 'PUBLISHED' && (
                    <span className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      Catalog live
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {staging ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => continueValidation(u)}
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {staging.status === 'PUBLISHED' ? 'View batch' : 'Validate courses'}
                  </button>
                ) : null}
                {staging ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void exportCourses(u)}
                      className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-bold text-white disabled:opacity-40 ${
                        staging.invalidRowCount > 0
                          ? 'border-amber-600 bg-amber-600'
                          : 'border-emerald-600 bg-emerald-600'
                      }`}
                      title="Download valid courses as CSV"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      {busy && busyAction === 'export'
                        ? 'Downloading…'
                        : 'Export CSV'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void exportCourses(u, 'data-fix')}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-40"
                      title="All course rows (valid and invalid). Drop in DATA FIX 4_col"
                    >
                      <FileSpreadsheet className="h-4 w-4" aria-hidden />
                      {busy && busyAction === 'export-fix'
                        ? 'Downloading…'
                        : 'Export for DATA FIX'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pickFilledCsv(u)}
                      className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40"
                      title="Apply 4_col_filled CSV by courseKey"
                    >
                      <CloudUpload className="h-4 w-4" aria-hidden />
                      Apply filled CSV
                    </button>
                  </>
                ) : null}
                {!staging && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => importFromCloud(u)}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-40"
                    title="Import *_reviewed.csv from Cloudinary"
                  >
                    <CloudDownload className="h-4 w-4" aria-hidden />
                    Import Cloudinary
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {universities.length === 0 && (
        <p className="font-bold text-slate-600">
          Database list is empty. Use{' '}
          <strong>Sync university names from Cloudinary</strong> above, or insert rows
          into <code>sys_Universities</code> manually.
        </p>
      )}
    </div>
  );
}