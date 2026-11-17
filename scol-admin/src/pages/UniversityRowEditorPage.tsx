import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Globe, Plus, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FieldErrorTooltip } from '../components/FieldErrorTooltip';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';
import {
  uploadFileToCloudinary,
  type CloudinarySignedUpload,
} from '../lib/cloudinaryUpload';
import { canPublishValidRows, validRowCount } from '../lib/batches';
import {
  adjacentInvalidIndex,
  fetchInvalidRowIndexes,
  resolveInitialRowIndex,
} from '../lib/batchInvalidRows';
import {
  getJsonParseError,
  prettifyJson,
} from '../lib/prettifyJson';
import {
  campusLinkDraft,
  isUniversityRowFieldRequired,
  locationLine,
  parseLocationMapHref,
  serializeCampusLifeLinks,
  youTubeId,
} from '../lib/universityRowFieldValidation';
import {
  clearWorkSession,
  setWorkSession,
  updateWorkSessionRow,
} from '../lib/workSession';

type RowResponse = {
  rowIndex: number;
  fields: Record<string, string>;
  fieldErrors: Record<string, string>;
  isValid: boolean;
};

type BatchResponse = {
  rowCount: number;
  universityKey: string;
  invalidRowCount: number;
  status?: string;
  sysCountryId?: string | null;
  countryCode?: string | null;
  displayName?: string;
  sourceFileName?: string | null;
};

const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Identity', keys: ['uniName', 'countryName', 'universityType', 'establishedYear'] },
  { title: 'Location', keys: ['stateName', 'cityName', 'address', 'locationMapMetaData'] },
  { title: 'Commercial', keys: ['commissionType', 'commission', 'currRanking'] },
  { title: 'Media', keys: ['logoUrl', 'website', 'coverImageUrl'] },
  { title: 'About', keys: ['aboutUs', 'rankingMetaData'] },
];

const LABELS: Record<string, string> = {
  uniName: 'University',
  countryName: 'Country',
  stateName: 'State',
  cityName: 'City',
  address: 'Address',
  commissionType: 'Commission type',
  commission: 'Commission',
  logoUrl: 'Logo URL',
  website: 'Website',
  aboutUs: 'About',
  coverImageUrl: 'Cover image URL',
  campusLifeLinks: 'Campus life links',
  rankingMetaData: 'Ranking metadata',
  locationMapMetaData: 'Map metadata',
  establishedYear: 'Established',
  universityType: 'Type',
  currRanking: 'Ranking',
};

export function UniversityRowEditorPage() {
  const navigate = useNavigate();
  const { batchId, rowIndex } = useParams();
  const idx = Number(rowIndex ?? '1');
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [row, setRow] = useState<RowResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [invalidRows, setInvalidRows] = useState<number[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [imageUploading, setImageUploading] = useState<'logo' | 'cover' | null>(
    null,
  );
  const [imageUploadError, setImageUploadError] = useState<{
    kind: 'logo' | 'cover';
    message: string;
  } | null>(null);
  const [imageDragOver, setImageDragOver] = useState<'logo' | 'cover' | null>(
    null,
  );
  const [campusDraft, setCampusDraft] = useState<string[]>(['']);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [showSplash, setShowSplash] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revalidated = useRef(false);
  const jumpedToIssue = useRef(false);

  const catalogPublished = batch?.status === 'PUBLISHED';
  const countryPath = batch?.sysCountryId
    ? `/destinations/${batch.sysCountryId}`
    : '/dashboard';

  const load = useCallback(async () => {
    if (!batchId) return;
    let b = await apiFetch<BatchResponse>(`/data-entry/batches/${batchId}`);
    if (!revalidated.current && b.status && b.status !== 'PUBLISHED') {
      revalidated.current = true;
      try {
        b = await apiFetch<BatchResponse>(
          `/data-entry/batches/${batchId}/revalidate`,
          { method: 'POST' },
        );
      } catch {
        /* keep previously staged validation */
      }
    }
    let targetIdx = idx;
    if (!jumpedToIssue.current && idx === 1 && b.invalidRowCount > 0) {
      jumpedToIssue.current = true;
      targetIdx = await resolveInitialRowIndex(batchId, b);
    }
    if (targetIdx !== idx) {
      navigate(`/work/${batchId}/rows/${targetIdx}`, { replace: true });
      return;
    }
    const r = await apiFetch<RowResponse>(
      `/data-entry/batches/${batchId}/rows/${targetIdx}`,
    );
    setBatch(b);
    setRow(r);
    setDraft({
      ...r.fields,
      rankingMetaData: prettifyJson(r.fields.rankingMetaData ?? ''),
    });
    setCampusDraft(campusLinkDraft(r.fields.campusLifeLinks ?? ''));
    setCoverFailed(false);
    setLogoFailed(false);
    setWorkSession({
      batchId,
      rowIndex: targetIdx,
      universityKey: b.universityKey,
      rowCount: b.rowCount,
    });
    setShowSplash(false);
    if (b.invalidRowCount > 0) {
      setInvalidRows(await fetchInvalidRowIndexes(batchId));
    } else {
      setInvalidRows([]);
    }
  }, [batchId, idx, navigate]);

  useEffect(() => {
    revalidated.current = false;
    jumpedToIssue.current = false;
  }, [batchId]);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      clearWorkSession();
      navigate('/destinations', { replace: true });
    });
  }, [load, navigate]);

  async function save(fields: Record<string, string>) {
    if (!batchId || catalogPublished) return;
    setSaveState('saving');
    try {
      const r = await apiFetch<RowResponse>(
        `/data-entry/batches/${batchId}/rows/${idx}`,
        { method: 'PATCH', body: JSON.stringify({ fields }) },
      );
      setRow(r);
      setSaveState('saved');
      updateWorkSessionRow(idx);
      const b = await apiFetch<BatchResponse>(`/data-entry/batches/${batchId}`);
      setBatch(b);
      if (b.invalidRowCount > 0) {
        setInvalidRows(await fetchInvalidRowIndexes(batchId));
      } else {
        setInvalidRows([]);
      }
    } catch {
      setSaveState('error');
    }
  }

  function setField(key: string, value: string) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (key === 'coverImageUrl') setCoverFailed(false);
    if (key === 'logoUrl') setLogoFailed(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void save(next);
    }, 600);
  }

  function setCampusLinks(next: string[]) {
    const links = next.length ? next : [''];
    setCampusDraft(links);
    setField('campusLifeLinks', serializeCampusLifeLinks(links));
  }

  function formatRanking() {
    const pretty = prettifyJson(draft.rankingMetaData ?? '');
    setField('rankingMetaData', pretty);
  }

  async function uploadUniversityImage(
    kind: 'logo' | 'cover',
    file: File,
  ) {
    if (!batchId || catalogPublished) return;
    const uniName = (draft.uniName ?? '').trim();
    if (!uniName) return;
    setImageUploading(kind);
    setImageUploadError(null);
    try {
      const signed = await apiFetch<CloudinarySignedUpload>(
        `/data-entry/batches/${batchId}/university-image-upload-url`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind,
            uniName,
            fileName: file.name,
            fileSizeBytes: file.size,
          }),
        },
      );
      const uploaded = await uploadFileToCloudinary(file, signed);
      if (!uploaded.secureUrl) {
        throw new Error('Cloudinary did not return an image URL');
      }
      setField(
        kind === 'logo' ? 'logoUrl' : 'coverImageUrl',
        uploaded.secureUrl,
      );
    } catch (e) {
      setImageUploadError({
        kind,
        message: e instanceof Error ? e.message : 'Image upload failed',
      });
    } finally {
      setImageUploading(null);
    }
  }

  async function publish() {
    if (!batchId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await apiFetch(`/data-entry/batches/${batchId}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const b = await apiFetch<BatchResponse>(`/data-entry/batches/${batchId}`);
      setBatch(b);
      setConfirmPublish(false);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  const prev = adjacentInvalidIndex(invalidRows, idx, 'prev');
  const next = adjacentInvalidIndex(invalidRows, idx, 'next');
  const canPublish = Boolean(
    batch &&
      canPublishValidRows({
        status: batch.status ?? '',
        rowCount: batch.rowCount,
        invalidRowCount: batch.invalidRowCount,
      }) &&
      !catalogPublished,
  );
  const invalidSet = useMemo(() => new Set(invalidRows), [invalidRows]);
  const locLine = locationLine(draft);
  const addressText = (draft.address ?? '').trim() || locLine;
  const mapHref = parseLocationMapHref(draft.locationMapMetaData ?? '').href;
  const rowInvalid = row ? !row.isValid : false;
  const rankingJsonError = getJsonParseError(draft.rankingMetaData ?? '');
  const campusError = row?.fieldErrors.campusLifeLinks;

  if (showSplash || !row || !batch) {
    return (
      <LoadingSplash
        title="Loading university row"
        subtitle="Reading staging fields…"
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Link
          to={countryPath}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-bold hover:bg-slate-50"
          onClick={() => clearWorkSession()}
        >
          Back
        </Link>
        <p className="text-sm font-bold text-slate-800">
          {batch.sourceFileName || batch.displayName} · row {idx}/{batch.rowCount}
          <span className={row.isValid ? 'ml-2 text-emerald-700' : 'ml-2 text-red-700'}>
            {row.isValid ? 'Valid' : 'Errors'}
          </span>
        </p>
        {idx > 1 && (
          <Link
            to={`/work/${batchId}/rows/${idx - 1}`}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-bold"
          >
            Prev
          </Link>
        )}
        {idx < batch.rowCount && (
          <Link
            to={`/work/${batchId}/rows/${idx + 1}`}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-bold"
          >
            Next
          </Link>
        )}
        {prev && (
          <Link
            to={`/work/${batchId}/rows/${prev}`}
            className="rounded border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700"
          >
            Prev issue
          </Link>
        )}
        {next && (
          <Link
            to={`/work/${batchId}/rows/${next}`}
            className="rounded border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700"
          >
            Next issue
          </Link>
        )}
        {invalidRows.length > 0 && (
          <span className="text-sm font-bold text-red-700">
            {invalidRows.length} to fix
          </span>
        )}
        {canPublish && (
          <button
            type="button"
            disabled={publishing}
            onClick={() => {
              setPublishError(null);
              setConfirmPublish(true);
            }}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {publishing
              ? 'Publishing…'
              : batch.invalidRowCount > 0
                ? 'Publish valid'
                : 'Publish catalog'}
          </button>
        )}
        {catalogPublished && (
          <span className="text-sm font-bold text-emerald-700">Published</span>
        )}
        <span className="text-sm font-medium text-slate-500">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? 'Saved'
              : saveState === 'error'
                ? 'Save failed'
                : 'Auto-save'}
        </span>
      </header>

      {batch.rowCount > 0 && (
        <nav
          aria-label="University rows"
          className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2"
        >
          {Array.from({ length: batch.rowCount }, (_, i) => i + 1).map((n) => {
            const invalid = invalidSet.has(n);
            const current = n === idx;
            return (
              <Link
                key={n}
                to={`/work/${batchId}/rows/${n}`}
                title={invalid ? `Row ${n} has errors` : `Row ${n}`}
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold ${
                  current && invalid
                    ? 'bg-red-700 text-white ring-2 ring-red-300'
                    : current
                      ? 'bg-slate-900 text-white'
                      : invalid
                        ? 'bg-red-100 text-red-800 ring-1 ring-red-400'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {n}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto p-4">
        {rowInvalid && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
            This row is invalid. Red fields must be fixed before publish.
          </p>
        )}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex min-h-[140px] items-center justify-center bg-slate-100">
            {draft.coverImageUrl && !coverFailed ? (
              <img
                src={draft.coverImageUrl}
                alt=""
                className="block max-h-[320px] w-full object-contain"
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <span className="px-4 py-8 text-sm font-bold text-slate-500">
                {draft.coverImageUrl
                  ? 'The cover image could not be loaded.'
                  : 'No cover image.'}
              </span>
            )}
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              {draft.logoUrl && !logoFailed ? (
                <img
                  src={draft.logoUrl}
                  alt=""
                  className="h-10 object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : null}
              <h1 className="text-xl font-bold text-slate-900">
                {draft.uniName || 'Unnamed university'}
              </h1>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.currRanking && (
                <span className="text-sm font-bold text-emerald-800">
                  #{draft.currRanking}
                </span>
              )}
              {draft.establishedYear && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  Estd. {draft.establishedYear}
                </span>
              )}
              {draft.universityType && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase text-slate-700">
                  {draft.universityType}
                </span>
              )}
              {locLine && (
                <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800">
                  {locLine}
                </span>
              )}
            </div>
            {draft.website && (
              <a
                href={draft.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
                {draft.website}
              </a>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
            Location
          </h2>
          <p className={`text-sm font-medium ${addressText ? 'text-slate-900' : 'text-slate-500'}`}>
            {addressText || 'Not specified'}
          </p>
          {addressText && (
            <iframe
              title="Map"
              src={`https://www.google.com/maps?q=${encodeURIComponent(addressText)}&z=15&output=embed`}
              loading="lazy"
              className="mt-3 block h-56 w-full rounded-2xl border-0"
            />
          )}
          {mapHref && (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open in Maps
            </a>
          )}
        </section>

        <section
          className={`rounded-lg border bg-white p-4 ${
            campusError ? 'border-red-400' : 'border-slate-200'
          }`}
        >
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
            Campus life <span className="text-red-600">*</span>
          </h2>
          <p className="mb-3 text-xs font-medium text-slate-500">
            One video link per field. The preview sits under that URL.
          </p>
          {campusError ? (
            <p className="mb-3 text-sm font-bold text-red-700">{campusError}</p>
          ) : null}
          <fieldset disabled={catalogPublished} className="contents">
            <div className="grid gap-4 sm:grid-cols-2">
              {campusDraft.map((url, i) => {
                const vid = youTubeId(url);
                return (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        aria-label={`Campus life URL ${i + 1}`}
                        value={url}
                        placeholder="https://youtu.be/..."
                        onChange={(e) => {
                          const next = [...campusDraft];
                          next[i] = e.target.value;
                          setCampusLinks(next);
                        }}
                        className={`w-full rounded border px-2 py-1.5 text-sm font-medium ${
                          campusError
                            ? 'border-red-500 bg-red-50 text-red-950'
                            : 'border-slate-300'
                        }`}
                      />
                      <button
                        type="button"
                        aria-label={`Remove campus life URL ${i + 1}`}
                        onClick={() =>
                          setCampusLinks(campusDraft.filter((_, j) => j !== i))
                        }
                        className="rounded border border-slate-300 px-2 text-slate-600 hover:bg-slate-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {vid ? (
                      <div className="overflow-hidden rounded-lg bg-slate-100">
                        <iframe
                          title={url}
                          src={`https://www.youtube.com/embed/${vid}`}
                          className="aspect-video w-full border-0"
                          allowFullScreen
                        />
                      </div>
                    ) : url.trim() ? (
                      <a
                        href={url.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-emerald-800"
                      >
                        Watch video
                      </a>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-50 text-xs font-bold text-slate-400">
                        Preview appears under the URL
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setCampusLinks([...campusDraft, ''])}
              className="mt-3 inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add video
            </button>
          </fieldset>
        </section>

        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={catalogPublished} className="contents">
            {GROUPS.map((group) => (
              <section
                key={group.title}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
                  {group.title}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.keys.map((key) => {
                    const required = isUniversityRowFieldRequired(key);
                    const err = row.fieldErrors[key];
                    const tall = key === 'aboutUs' || key === 'locationMapMetaData';
                    if (key === 'logoUrl' || key === 'coverImageUrl') {
                      const kind = key === 'logoUrl' ? 'logo' : 'cover';
                      const hasName = Boolean((draft.uniName ?? '').trim());
                      const busy = imageUploading === kind;
                      const blocked = !hasName || catalogPublished || busy;
                      const hasUrl = Boolean((draft[key] ?? '').trim());
                      const cta = busy
                        ? 'Uploading…'
                        : kind === 'logo'
                          ? hasUrl
                            ? 'Replace logo'
                            : 'Choose logo'
                          : hasUrl
                            ? 'Replace cover photo'
                            : 'Choose cover photo';
                      return (
                        <div
                          key={key}
                          className={`block text-sm font-bold text-slate-700 ${
                            key === 'coverImageUrl' ? 'sm:col-span-2' : ''
                          }`}
                        >
                          {LABELS[key]}
                          <span className="ml-0.5 text-red-600">*</span>
                          <FieldErrorTooltip
                            fieldKey={key}
                            message={err}
                            required
                          >
                            <input
                              value={draft[key] ?? ''}
                              onChange={(e) => setField(key, e.target.value)}
                              className={`mt-1 w-full rounded border px-2 py-1 text-sm font-medium ${
                                err
                                  ? 'border-red-500 bg-red-50 text-red-950'
                                  : 'border-slate-300'
                              }`}
                            />
                          </FieldErrorTooltip>
                          <label
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (!blocked) setImageDragOver(kind);
                            }}
                            onDragLeave={() => setImageDragOver(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setImageDragOver(null);
                              if (blocked) return;
                              const file = e.dataTransfer.files?.[0];
                              if (file) void uploadUniversityImage(kind, file);
                            }}
                            className={`mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-center ${
                              blocked
                                ? 'cursor-not-allowed border-slate-200 bg-slate-50'
                                : imageDragOver === kind
                                  ? 'border-emerald-600 bg-emerald-50'
                                  : 'border-slate-300 bg-slate-50 hover:border-slate-500 hover:bg-white'
                            }`}
                          >
                            <Upload
                              className={`h-5 w-5 ${
                                blocked ? 'text-slate-400' : 'text-slate-600'
                              }`}
                              aria-hidden
                            />
                            <span
                              className={`rounded px-4 py-2 text-sm font-bold ${
                                blocked
                                  ? 'bg-slate-200 text-slate-500'
                                  : 'bg-slate-900 text-white'
                              }`}
                            >
                              {cta}
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                              {blocked && !hasName
                                ? 'Add the university name first, then upload an image.'
                                : 'JPG, PNG, WebP, or GIF. Click or drop a file — the URL fills in for you.'}
                            </span>
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                              className="sr-only"
                              disabled={blocked}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void uploadUniversityImage(kind, file);
                              }}
                            />
                          </label>
                          {imageUploadError?.kind === kind ? (
                            <p className="mt-1 text-xs font-bold text-red-700">
                              {imageUploadError.message}
                            </p>
                          ) : null}
                        </div>
                      );
                    }
                    if (key === 'rankingMetaData') {
                      return (
                        <div key={key} className="sm:col-span-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-700">
                              {LABELS[key]}
                              <span className="ml-0.5 text-red-600">*</span>
                            </span>
                            <button
                              type="button"
                              onClick={formatRanking}
                              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              Format JSON
                            </button>
                          </div>
                          <FieldErrorTooltip
                            fieldKey={key}
                            message={err}
                            jsonError={rankingJsonError}
                            required
                          >
                            <textarea
                              value={draft[key] ?? ''}
                              onChange={(e) => setField(key, e.target.value)}
                              onBlur={() => formatRanking()}
                              spellCheck={false}
                              rows={12}
                              className={`mt-1 w-full rounded border px-2 py-2 font-mono text-xs font-medium leading-5 ${
                                err || rankingJsonError
                                  ? 'border-red-500 bg-red-50 text-red-950'
                                  : 'border-slate-300'
                              }`}
                            />
                          </FieldErrorTooltip>
                        </div>
                      );
                    }
                    return (
                      <label
                        key={key}
                        className={`block text-sm font-bold text-slate-700 ${tall ? 'sm:col-span-2' : ''}`}
                      >
                        {LABELS[key] ?? key}
                        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
                        <FieldErrorTooltip
                          fieldKey={key}
                          message={err}
                          required={required}
                        >
                          {tall ? (
                            <textarea
                              value={draft[key] ?? ''}
                              onChange={(e) => setField(key, e.target.value)}
                              rows={4}
                              className={`mt-1 w-full rounded border px-2 py-1 text-sm font-medium ${
                                err
                                  ? 'border-red-500 bg-red-50 text-red-950'
                                  : 'border-slate-300'
                              }`}
                            />
                          ) : (
                            <input
                              value={draft[key] ?? ''}
                              onChange={(e) => setField(key, e.target.value)}
                              className={`mt-1 w-full rounded border px-2 py-1 text-sm font-medium ${
                                err
                                  ? 'border-red-500 bg-red-50 text-red-950'
                                  : 'border-slate-300'
                              }`}
                            />
                          )}
                        </FieldErrorTooltip>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </fieldset>
        </form>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        title="Publish universities?"
        confirmLabel={
          batch.invalidRowCount > 0 ? 'Publish valid' : 'Publish'
        }
        busyLabel="Publishing…"
        tone="primary"
        busy={publishing}
        error={publishError}
        onCancel={() => {
          if (!publishing) {
            setConfirmPublish(false);
            setPublishError(null);
          }
        }}
        onConfirm={() => void publish()}
      >
        {batch.invalidRowCount > 0
          ? `Publish ${validRowCount(batch)} valid universities to catalog? ${batch.invalidRowCount} invalid rows will be skipped.`
          : `This writes ${batch.rowCount} validated universities into sys_Universities and related geo tables. Students will see logo, cover, location and campus links as previewed above.`}
      </ConfirmDialog>
    </div>
  );
}
