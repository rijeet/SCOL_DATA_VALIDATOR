import { useEffect, useRef, useState } from 'react';
import {
  CloudUpload,
  Download,
  FileSpreadsheet,
  LogOut,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

export function UniversitiesPage() {
  const navigate = useNavigate();
  const [universities, setUniversities] = useState<UniversityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    'continue' | 'export' | 'export-fix' | 'apply' | null
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
            List from the database. Import a course CSV from the destination
            page when a university has no staging rows yet.
          </p>
        </div>
        <div className="flex items-center gap-4">
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
                      : 'No staging data yet'}
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
              </div>
            </li>
          );
        })}
      </ul>
      {universities.length === 0 && (
        <p className="font-bold text-slate-600">
          Database list is empty. Add rows to <code>sys_Universities</code>, then
          import a CSV from the destination page.
        </p>
      )}
    </div>
  );
}