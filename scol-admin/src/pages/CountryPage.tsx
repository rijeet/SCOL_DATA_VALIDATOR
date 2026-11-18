import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudDownload, CloudUpload, FileSpreadsheet, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';
import type { BatchItem, CountryUniversityItem } from '../lib/batches';
import {
  canPublishValidRows,
  publishButtonLabel,
  statusLabel,
  validRowCount,
} from '../lib/batches';
import { applyFilledCsv } from '../lib/applyFilledCsv';
import { exportBatchCsv } from '../lib/exportBatchCsv';
import { resolveInitialRowIndex } from '../lib/initialWorkRow';
import { setWorkSession } from '../lib/workSession';
import type { DestinationItem } from '../lib/batches';

export function CountryPage() {
  const navigate = useNavigate();
  const { countryId } = useParams();
  const [country, setCountry] = useState<DestinationItem | null>(null);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [universities, setUniversities] = useState<CountryUniversityItem[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const filledInputRef = useRef<HTMLInputElement>(null);
  const applyBatchIdRef = useRef<string | null>(null);
  const [pending, setPending] = useState<null | {
    kind: 'publish' | 'delete';
    batch: BatchItem;
  }>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applyNote, setApplyNote] = useState<string | null>(null);

  const title = country?.countryName ?? 'Destination';
  const universityBatches = useMemo(
    () => batches.filter((b) => b.batchType === 'UNIVERSITY'),
    [batches],
  );
  const leftoverCourseBatches = useMemo(
    () =>
      batches.filter(
        (b) => b.batchType === 'COURSE' && !b.sysUniversityId,
      ),
    [batches],
  );

  function matchesUniversity(batch: BatchItem, uniName: string) {
    const name = uniName.trim().toLowerCase();
    if (!name) return false;
    const hay = [
      batch.universityKey,
      batch.sourceFileName,
      batch.displayName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(name);
  }

  function courseWorkForUni(uni: CountryUniversityItem): BatchItem | null {
    const leftover = leftoverCourseBatches.find((b) =>
      matchesUniversity(b, uni.uniName),
    );
    if (leftover && leftover.invalidRowCount > 0) return leftover;
    if (uni.staging) {
      return {
        id: uni.staging.batchId,
        batchType: 'COURSE',
        displayName: uni.uniName,
        universityKey: uni.uniName,
        sysUniversityId: uni.sysUniversityId,
        status: uni.staging.status,
        rowCount: uni.staging.rowCount,
        invalidRowCount: uni.staging.invalidRowCount,
        publishedAt: uni.staging.publishedAt,
      };
    }
    return leftover ?? null;
  }

  async function refresh() {
    if (!countryId) return;
    const [destinations, list, unis] = await Promise.all([
      apiFetch<DestinationItem[]>('/data-entry/destinations'),
      apiFetch<BatchItem[]>(`/data-entry/destinations/${countryId}/batches`),
      apiFetch<CountryUniversityItem[]>(
        `/data-entry/destinations/${countryId}/universities`,
      ),
    ]);
    setCountry(destinations.find((d) => d.sysCountryId === countryId) ?? null);
    setBatches(list);
    setUniversities(unis);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load country');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId]);

  async function openEditor(
    batch: Pick<BatchItem, 'id' | 'rowCount' | 'invalidRowCount' | 'batchType'>,
    universityKey?: string,
  ) {
    const rowIndex = await resolveInitialRowIndex(batch.id, {
      rowCount: batch.rowCount,
      invalidRowCount: batch.invalidRowCount,
    });
    setWorkSession({
      batchId: batch.id,
      rowIndex,
      universityKey: universityKey || country?.countryName || 'batch',
      rowCount: batch.rowCount,
    });
    navigate(`/work/${batch.id}/rows/${rowIndex}`);
  }

  async function publishBatch(batch: BatchItem) {
    setPublishingId(batch.id);
    setActionError(null);
    try {
      await apiFetch(`/data-entry/batches/${batch.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setPending(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishingId(null);
    }
  }

  async function deleteBatch(batch: BatchItem) {
    setDeletingId(batch.id);
    setActionError(null);
    try {
      await apiFetch(`/data-entry/batches/${batch.id}`, { method: 'DELETE' });
      setPending(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function exportRows(
    batch: Pick<BatchItem, 'id' | 'rowCount'>,
    fileLabel: string,
    format?: 'data-fix',
  ) {
    setExportingId(batch.id);
    setActionError(null);
    try {
      await exportBatchCsv(batch.id, fileLabel, format);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingId(null);
    }
  }

  function pickFilledCsv(batchId: string) {
    applyBatchIdRef.current = batchId;
    filledInputRef.current?.click();
  }

  async function onFilledFile(file: File | undefined) {
    const batchId = applyBatchIdRef.current;
    applyBatchIdRef.current = null;
    if (!file || !batchId) return;
    setApplyingId(batchId);
    setActionError(null);
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
      setActionError(e instanceof Error ? e.message : 'Apply filled CSV failed');
    } finally {
      setApplyingId(null);
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <LoadingSplash title="Loading country" subtitle="Reading batches…" />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm font-bold text-slate-600">
            Publish universities first, then import a course CSV per university.
          </p>
        </header>

        {error && (
          <p className="mb-4 text-sm font-bold text-red-600">{error}</p>
        )}
        {actionError && !pending && (
          <p className="mb-4 text-sm font-bold text-red-600">{actionError}</p>
        )}
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

        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
              University batches
            </h2>
            <Link
              to={`/destinations/${countryId}/import?type=UNIVERSITY`}
              className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              <CloudUpload className="h-4 w-4" aria-hidden />
              Import Uni CSV
            </Link>
          </div>
          <ul
            className={`space-y-3 ${
              universityBatches.length > 6
                ? 'max-h-80 overflow-y-auto pr-1'
                : ''
            }`}
          >
            {universityBatches.map((b) => (
              <BatchCard
                key={b.id}
                batch={b}
                publishingId={publishingId}
                deletingId={deletingId}
                exportingId={exportingId}
                onValidate={() => void openEditor(b)}
                onExport={() =>
                  void exportRows(b, b.sourceFileName || b.displayName)
                }
                onPublish={() => {
                  setActionError(null);
                  setPending({ kind: 'publish', batch: b });
                }}
                onDelete={() => {
                  setActionError(null);
                  setPending({ kind: 'delete', batch: b });
                }}
              />
            ))}
          </ul>
          {universityBatches.length === 0 && (
            <p className="font-bold text-slate-600">
              No university batches yet.{' '}
              <Link
                to={`/destinations/${countryId}/import?type=UNIVERSITY`}
                className="text-emerald-800 underline"
              >
                Import a CSV
              </Link>
              .
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
            Published universities
          </h2>
          <ul className="space-y-3">
            {universities.map((uni) => {
              const work = courseWorkForUni(uni);
              const canOpen =
                work &&
                work.rowCount > 0 &&
                work.status !== 'AWAITING_UPLOAD' &&
                work.status !== 'FAILED';
              const canPublish = work && canPublishValidRows(work);
              const canDelete =
                work &&
                (work.status === 'FAILED' ||
                  work.status === 'AWAITING_UPLOAD');
              return (
                <li
                  key={uni.sysUniversityId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-bold text-slate-900">{uni.uniName}</p>
                    <p className="text-sm font-bold text-slate-500">
                      {work
                        ? `${work.rowCount} courses · ${statusLabel(work)}`
                        : 'No course CSV yet'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/destinations/${countryId}/import?type=COURSE&sysUniversityId=${uni.sysUniversityId}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800"
                    >
                      <CloudUpload className="h-4 w-4" aria-hidden />
                      Import course CSV
                    </Link>
                    {canOpen && work && (
                      <button
                        type="button"
                        onClick={() => void openEditor(work, uni.uniName)}
                        className="rounded bg-slate-900 px-3 py-2 text-sm font-bold text-white"
                      >
                        {work.status === 'PUBLISHED' ? 'View' : 'Validate'}
                      </button>
                    )}
                    {work && work.rowCount > 0 && (
                      <>
                        <button
                          type="button"
                          disabled={exportingId === work.id}
                          onClick={() =>
                            void exportRows(
                              work,
                              work.sourceFileName || uni.uniName,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"
                        >
                          <CloudDownload className="h-4 w-4" aria-hidden />
                          {exportingId === work.id
                            ? 'Downloading…'
                            : 'Export CSV'}
                        </button>
                        <button
                          type="button"
                          disabled={exportingId === work.id}
                          onClick={() =>
                            void exportRows(
                              work,
                              uni.uniName,
                              'data-fix',
                            )
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"
                          title="All course rows (valid and invalid). Drop in DATA FIX 4_col"
                        >
                          <FileSpreadsheet className="h-4 w-4" aria-hidden />
                          {exportingId === work.id
                            ? 'Downloading…'
                            : 'Export for DATA FIX'}
                        </button>
                        <button
                          type="button"
                          disabled={applyingId === work.id}
                          onClick={() => pickFilledCsv(work.id)}
                          className="inline-flex items-center gap-1 rounded border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50"
                          title="Apply 4_col_filled CSV by courseKey"
                        >
                          <CloudUpload className="h-4 w-4" aria-hidden />
                          {applyingId === work.id
                            ? 'Applying…'
                            : 'Apply filled CSV'}
                        </button>
                      </>
                    )}
                    {canPublish && work && (
                      <button
                        type="button"
                        disabled={publishingId === work.id}
                        onClick={() => {
                          setActionError(null);
                          setPending({ kind: 'publish', batch: work });
                        }}
                        className="rounded bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {publishingId === work.id
                          ? 'Publishing…'
                          : publishButtonLabel(work)}
                      </button>
                    )}
                    {canDelete && work && (
                      <button
                        type="button"
                        disabled={deletingId === work.id}
                        onClick={() => {
                          setActionError(null);
                          setPending({ kind: 'delete', batch: work });
                        }}
                        className="inline-flex items-center gap-1 rounded border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {deletingId === work.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {universities.length === 0 && (
            <p className="font-bold text-slate-600">
              Publish a university CSV first, then import courses per
              university.
            </p>
          )}
        </section>

        <ConfirmDialog
          open={pending?.kind === 'publish'}
          title="Publish this batch?"
          confirmLabel={
            pending?.batch && pending.batch.invalidRowCount > 0
              ? 'Publish valid'
              : 'Publish'
          }
          busyLabel="Publishing…"
          tone="primary"
          busy={publishingId !== null}
          error={actionError}
          onCancel={() => {
            if (!publishingId) {
              setPending(null);
              setActionError(null);
            }
          }}
          onConfirm={() => {
            if (pending?.kind === 'publish') void publishBatch(pending.batch);
          }}
        >
          {pending?.batch
            ? pending.batch.invalidRowCount > 0
              ? `Publish ${validRowCount(pending.batch)} valid ${
                  pending.batch.batchType === 'UNIVERSITY'
                    ? 'universities'
                    : 'courses'
                } to catalog? ${pending.batch.invalidRowCount} invalid rows will be skipped.`
              : pending.batch.batchType === 'UNIVERSITY'
                ? 'Publish validated universities into sys_Universities and related geo tables?'
                : 'Publish validated courses into the catalog tables?'
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={pending?.kind === 'delete'}
          title="Delete this batch?"
          confirmLabel="Delete"
          busyLabel="Deleting…"
          tone="danger"
          busy={deletingId !== null}
          error={actionError}
          onCancel={() => {
            if (!deletingId) {
              setPending(null);
              setActionError(null);
            }
          }}
          onConfirm={() => {
            if (pending?.kind === 'delete') void deleteBatch(pending.batch);
          }}
        >
          Delete {pending?.batch.sourceFileName || pending?.batch.displayName}?
          This cannot be undone.
        </ConfirmDialog>
      </div>
    </AdminShell>
  );
}

function BatchCard({
  batch,
  publishingId,
  deletingId,
  exportingId,
  onValidate,
  onExport,
  onPublish,
  onDelete,
}: {
  batch: BatchItem;
  publishingId: string | null;
  deletingId: string | null;
  exportingId: string | null;
  onValidate: () => void;
  onExport: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const canOpen =
    batch.status !== 'AWAITING_UPLOAD' &&
    batch.status !== 'FAILED' &&
    batch.rowCount > 0;
  const canPublish = canPublishValidRows(batch);
  const canDelete =
    batch.status === 'FAILED' || batch.status === 'AWAITING_UPLOAD';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="font-bold text-slate-900">
          {batch.sourceFileName || batch.displayName}
        </p>
        <p className="text-sm font-bold text-slate-500">
          {batch.rowCount} rows · {statusLabel(batch)}
        </p>
        {batch.failureReason && (
          <p className="mt-1 text-xs font-bold text-red-600">
            {batch.failureReason}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {canOpen && (
          <button
            type="button"
            onClick={onValidate}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-bold text-white"
          >
            {batch.status === 'PUBLISHED' ? 'View' : 'Validate'}
          </button>
        )}
        {canOpen && (
          <button
            type="button"
            disabled={exportingId === batch.id}
            onClick={onExport}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50"
          >
            <CloudDownload className="h-4 w-4" aria-hidden />
            {exportingId === batch.id ? 'Downloading…' : 'Export CSV'}
          </button>
        )}
        {canPublish && (
          <button
            type="button"
            disabled={publishingId === batch.id}
            onClick={onPublish}
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {publishingId === batch.id
              ? 'Publishing…'
              : publishButtonLabel(batch)}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            disabled={deletingId === batch.id}
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {deletingId === batch.id ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </li>
  );
}
