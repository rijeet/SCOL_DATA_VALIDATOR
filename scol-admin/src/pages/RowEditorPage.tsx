import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingSplash } from '../components/LoadingSplash';
import { UniversityHelpersPanel } from '../components/UniversityHelpersPanel';
import { CourseUrlReferencePanel } from '../components/CourseUrlReferencePanel';
import { apiFetch } from '../lib/api';
import {
  adjacentInvalidIndex,
  fetchInvalidRowIndexes,
  resolveInitialRowIndex,
} from '../lib/batchInvalidRows';
import { validateCourseRowScoreAndCompleteness } from '../lib/courseRowFieldValidation';
import { hintForField } from '../lib/fieldErrorHints';
import {
  getJsonParseError,
  prettifyJson,
  prettifyMetaFields,
} from '../lib/prettifyJson';
import {
  clearWorkSession,
  setWorkSession,
  updateWorkSessionRow,
} from '../lib/workSession';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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
};

type PublishReadiness = {
  canPublish: boolean;
  status: string;
  publishedAt: string | null;
  invalidRowCount: number;
  allRowsValid: boolean;
};

type PublishResult = {
  message: string;
  coursesCreated: number;
  intakesCreated: number;
  scholarshipsCreated: number;
  engReqsCreated: number;
  uniAcademicReqsCreated: number;
  uniEngReqsCreated: number;
  publishedAt: string;
};

const LABELS: Record<string, string> = {
  uniName: 'University',
  programmeName: 'Programme',
  courseName: 'Course',
  degreeName: 'Degree',
  intakeInfo: 'Intake',
  courseDuration: 'Duration',
  minDegreeName: 'Min deg',
  minGpa: 'Min GPA',
  higherDegreeName: 'High deg',
  higherGpa: 'High GPA',
  ieltsMinOverall: 'Overall',
  ieltsMinSection: 'Min',
  toeflMinOverall: 'Overall',
  toeflMinSection: 'Min',
  pteMinOverall: 'Overall',
  pteMinSection: 'Min',
  scholarshipName: 'Scholarship',
  scholarshipAmount: 'Amount',
  scholarshipType: 'Type',
  tuitionFee: 'Tuition',
  currency: 'Currency',
  initialDeposit: 'Deposit',
  applicationFee: 'Application Fee',
  commission: 'Commission',
  applicationDeadline: 'Deadline',
  courseUrlExternal: 'Course URL',
};

const ENGLISH_TESTS = [
  { name: 'IELTS', overall: 'ieltsMinOverall', section: 'ieltsMinSection' },
  { name: 'TOEFL', overall: 'toeflMinOverall', section: 'toeflMinSection' },
  { name: 'PTE', overall: 'pteMinOverall', section: 'pteMinSection' },
] as const;

/** Wait after last keystroke before auto-save (finish typing / full word). */
const AUTO_SAVE_IDLE_MS = 2200;
/** After a word delimiter, still wait this long (not instant). */
const AUTO_SAVE_AFTER_WORD_MS = 1400;

function endsWordDelimiter(value: string): boolean {
  if (!value) return false;
  return /[\s,;|/]/.test(value.slice(-1));
}

function hasField(
  key: string,
  draft: Record<string, string>,
  row: RowResponse | null,
) {
  return draft[key] !== undefined || row?.fields[key] !== undefined;
}

export function RowEditorPage() {
  const navigate = useNavigate();
  const { batchId, rowIndex } = useParams();
  const idx = Number(rowIndex ?? '1');
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [row, setRow] = useState<RowResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [splitUrl, setSplitUrl] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [publishReadiness, setPublishReadiness] =
    useState<PublishReadiness | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState<PublishResult | null>(null);
  const [invalidRows, setInvalidRows] = useState<number[]>([]);
  const [helpersOpen, setHelpersOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [jumpRowInput, setJumpRowInput] = useState('');
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const loadedBatchIdRef = useRef<string | null>(null);

  draftRef.current = draft;

  const refreshInvalidRows = useCallback(async () => {
    if (!batchId) return;
    try {
      setInvalidRows(await fetchInvalidRowIndexes(batchId));
    } catch {
      setInvalidRows([]);
    }
  }, [batchId]);

  const refreshPublishReadiness = useCallback(async () => {
    if (!batchId) return;
    try {
      const r = await apiFetch<PublishReadiness>(
        `/data-entry/batches/${batchId}/publish-readiness`,
      );
      setPublishReadiness(r);
      if (r.status === 'PUBLISHED') {
        setBatch((b) => (b ? { ...b, invalidRowCount: r.invalidRowCount } : b));
      }
      if (r.invalidRowCount > 0) {
        await refreshInvalidRows();
      } else {
        setInvalidRows([]);
      }
    } catch {
      setPublishReadiness(null);
    }
  }, [batchId, refreshInvalidRows]);

  const load = useCallback(async () => {
    if (!batchId) return;
    const openingBatch = loadedBatchIdRef.current !== batchId;
    if (openingBatch) {
      setShowSplash(true);
    }
    try {
      if (openingBatch) {
        const b = await apiFetch<BatchResponse>(`/data-entry/batches/${batchId}`);
        let targetIdx = idx;
        if (idx === 1 && b.invalidRowCount > 0) {
          targetIdx = await resolveInitialRowIndex(batchId, b);
        }
        if (targetIdx !== idx) {
          navigate(`/work/${batchId}/rows/${targetIdx}`, { replace: true });
          return;
        }
        const r = await apiFetch<RowResponse>(
          `/data-entry/batches/${batchId}/rows/${targetIdx}`,
        );
        loadedBatchIdRef.current = batchId;
        setBatch(b);
        setRow(r);
        setDraft(prettifyMetaFields(r.fields));
        setWorkSession({
          batchId,
          rowIndex: targetIdx,
          universityKey: b.universityKey,
          rowCount: b.rowCount,
        });
        setShowSplash(false);
        void refreshPublishReadiness();
      } else {
        const r = await apiFetch<RowResponse>(
          `/data-entry/batches/${batchId}/rows/${idx}`,
        );
        setRow(r);
        setDraft(prettifyMetaFields(r.fields));
        updateWorkSessionRow(idx, batch?.rowCount);
      }
    } catch (e) {
      if (openingBatch) {
        setShowSplash(false);
      }
      throw e;
    }
  }, [batchId, idx, batch?.rowCount, navigate, refreshPublishReadiness]);

  async function publishToCatalog() {
    if (!batchId || !publishReadiness?.canPublish) return;
    if (
      !window.confirm(
        'Publish all validated courses to the live catalog? This replaces existing courses for this university.',
      )
    ) {
      return;
    }
    setPublishing(true);
    setPublishNotice(null);
    try {
      const result = await apiFetch<PublishResult>(
        `/data-entry/batches/${batchId}/publish`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPublishNotice(result);
      await refreshPublishReadiness();
      const b = await apiFetch<BatchResponse>(`/data-entry/batches/${batchId}`);
      setBatch(b);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      clearWorkSession();
      navigate('/universities', { replace: true });
    });
  }, [load, navigate]);

  useEffect(() => {
    updateWorkSessionRow(idx, batch?.rowCount);
  }, [idx, batch?.rowCount]);

  useEffect(() => {
    setJumpRowInput(String(idx));
  }, [idx]);

  const displayFieldErrors = useMemo(() => {
    const merged = { ...(row?.fieldErrors ?? {}) };
    const live = validateCourseRowScoreAndCompleteness({
      ...row?.fields,
      ...draft,
    });
    for (const [k, v] of Object.entries(live)) {
      if (v?.trim()) merged[k] = v;
    }
    return merged;
  }, [row, draft]);

  const persistRow = useCallback(
    async (fields: Record<string, string>) => {
      if (!batchId || savingRef.current) return;
      savingRef.current = true;
      setSaveState('saving');
      try {
        const updated = await apiFetch<RowResponse>(
          `/data-entry/batches/${batchId}/rows/${idx}`,
          { method: 'PATCH', body: JSON.stringify({ fields }) },
        );
        setRow(updated);
        setDraft(prettifyMetaFields(updated.fields));
        setSaveState('saved');
        const b = await apiFetch<BatchResponse>(
          `/data-entry/batches/${batchId}`,
        );
        setBatch(b);
        await refreshPublishReadiness();
      } catch {
        setSaveState('error');
      } finally {
        savingRef.current = false;
      }
    },
    [batchId, idx, refreshPublishReadiness],
  );

  const scheduleSave = useCallback(
    (fields: Record<string, string>, opts?: { wordCompleted?: boolean }) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      const delay = opts?.wordCompleted
        ? AUTO_SAVE_AFTER_WORD_MS
        : AUTO_SAVE_IDLE_MS;
      saveTimerRef.current = setTimeout(() => {
        void persistRow(fields);
      }, delay);
    },
    [persistRow],
  );

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persistRow(draftRef.current);
  }, [persistRow]);

  const goToRowNumber = useCallback(
    async (raw: string) => {
      if (!batchId || !batch?.rowCount) return;
      const parsed = Number.parseInt(raw.trim(), 10);
      if (!Number.isFinite(parsed)) {
        setJumpRowInput(String(idx));
        return;
      }
      const target = Math.min(Math.max(1, parsed), batch.rowCount);
      setJumpRowInput(String(target));
      if (target === idx) return;
      await flushSave();
      navigate(`/work/${batchId}/rows/${target}`);
    },
    [batch?.rowCount, batchId, flushSave, idx, navigate],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  function setField(key: string, value: string) {
    const prev = draftRef.current[key] ?? '';
    const wordCompleted =
      value.length > 0 &&
      value.length >= prev.length &&
      endsWordDelimiter(value);
    setDraft((d) => {
      const next = { ...d, [key]: value };
      draftRef.current = next;
      scheduleSave(next, { wordCompleted });
      return next;
    });
    setSaveState('idle');
  }

  function exitUniversity() {
    void flushSave().finally(() => {
      clearWorkSession();
      navigate('/universities');
    });
  }

  function inputClass(
    key: string,
    extra = '',
    width: 'full' | 'fit' = 'full',
  ) {
    const invalid = displayFieldErrors[key];
    return [
      width === 'full' ? 'w-full' : 'field-fit',
      'rounded border px-1.5 py-0.5 text-sm font-bold leading-tight',
      invalid ? 'border-red-400 bg-red-50' : 'border-slate-300/80 bg-white',
      extra,
    ].join(' ');
  }

  function FieldErrorHint({ fieldKey }: { fieldKey: string }) {
    const message = displayFieldErrors[fieldKey];
    if (!message) return null;
    const hint = hintForField(fieldKey);
    return (
      <div className="mt-0.5 space-y-0.5">
        <p className="text-sm font-bold leading-tight text-red-600">
          {message}
        </p>
        {hint && (
          <p className="text-sm font-bold leading-tight text-amber-900/85">
            {hint}
          </p>
        )}
      </div>
    );
  }

  function MiniInput({
    fieldKey,
    className = '',
  }: {
    fieldKey: string;
    className?: string;
  }) {
    if (!hasField(fieldKey, draft, row)) {
      return <span aria-hidden className="block h-7" />;
    }
    return (
      <div className="min-w-0">
        <input
          className={inputClass(
            fieldKey,
            `h-8 w-full min-w-[2.75rem] px-1 text-center text-sm font-bold tabular-nums ${className}`,
          )}
          value={draft[fieldKey] ?? ''}
          onChange={(e) => setField(fieldKey, e.target.value)}
          onBlur={() => void flushSave()}
          title={LABELS[fieldKey] ?? fieldKey}
        />
        <FieldErrorHint fieldKey={fieldKey} />
      </div>
    );
  }

  function Cell({
    fieldKey,
    label,
    inputClassName = '',
    multiline = false,
    boxClassName = '',
    fitWidth = false,
  }: {
    fieldKey: string;
    label?: string;
    inputClassName?: string;
    multiline?: boolean;
    boxClassName?: string;
    fitWidth?: boolean;
  }) {
    if (!hasField(fieldKey, draft, row)) return null;
    const text = label ?? LABELS[fieldKey] ?? fieldKey;
    const value = draft[fieldKey] ?? '';
    const widthMode = fitWidth && !multiline ? 'fit' : 'full';
    return (
      <label
        className={`flex flex-col items-start gap-0.5 ${boxClassName || 'min-w-0'}`}
      >
        <span className="whitespace-nowrap text-sm font-bold text-slate-700">
          {text}
        </span>
        {multiline ? (
          <textarea
            className={inputClass(
              fieldKey,
              `resize-none ${inputClassName}`,
              'full',
            )}
            rows={1}
            value={value}
            onChange={(e) => setField(fieldKey, e.target.value)}
            onBlur={() => void flushSave()}
          />
        ) : (
          <input
            className={inputClass(fieldKey, inputClassName, widthMode)}
            size={
              widthMode === 'fit'
                ? Math.min(72, Math.max(6, value.length + 2))
                : undefined
            }
            value={value}
            onChange={(e) => setField(fieldKey, e.target.value)}
            onBlur={() => void flushSave()}
          />
        )}
        <FieldErrorHint fieldKey={fieldKey} />
      </label>
    );
  }

  function handleMetaBlur(key: string) {
    const raw = draftRef.current[key] ?? '';
    const pretty = prettifyJson(raw);
    if (pretty !== raw) {
      setDraft((d) => {
        const next = { ...d, [key]: pretty };
        draftRef.current = next;
        scheduleSave(next);
        return next;
      });
    }
    void flushSave();
  }

  function formatMetaField(key: string) {
    const pretty = prettifyJson(draftRef.current[key] ?? '');
    setField(key, pretty);
    void flushSave();
  }

  function renderMetaPanel(key: string, title: string, tint: string) {
    if (!hasField(key, draft, row)) return null;
    const value = draft[key] ?? '';
    const jsonErr = getJsonParseError(value);
    const serverErr = displayFieldErrors[key];
    const hint = hintForField(key);
    return (
      <section
        key={key}
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-sm ${
          serverErr || jsonErr
            ? 'border-red-200 bg-white'
            : 'border-slate-200 bg-white'
        } ${tint}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-2 py-1">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => formatMetaField(key)}
            className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Format JSON
          </button>
        </header>
        <textarea
          className={inputClass(
            key,
            `min-h-0 flex-1 resize-none border-0 px-2 py-2 font-mono text-sm font-bold leading-relaxed whitespace-pre shadow-none focus:ring-1 focus:ring-slate-300 ${
              jsonErr && value.trim() ? 'bg-red-50/50' : 'bg-slate-50/40'
            }`,
          )}
          value={value}
          onChange={(e) => setField(key, e.target.value)}
          onBlur={() => handleMetaBlur(key)}
          spellCheck={false}
        />
        {(serverErr || jsonErr || hint) && (serverErr || jsonErr) && (
          <div className="shrink-0 space-y-0.5 border-t border-red-100 bg-red-50/80 px-2 py-1.5">
            {serverErr && (
              <p className="text-sm font-bold text-red-700">{serverErr}</p>
            )}
            {jsonErr && (
              <p className="text-sm font-bold text-red-600">
                JSON: {jsonErr}
              </p>
            )}
            {hint && (
              <p className="text-sm font-bold leading-snug text-amber-900/90">
                Hint: {hint}
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  const courseUrl = draft.courseUrlExternal?.trim();
  const sequentialPrev = idx > 1 ? idx - 1 : null;
  const sequentialNext =
    batch && idx < batch.rowCount ? idx + 1 : null;
  const fixMode =
    (batch?.invalidRowCount ?? 0) > 0 && invalidRows.length > 0;
  const prev = fixMode
    ? adjacentInvalidIndex(invalidRows, idx, 'prev')
    : sequentialPrev;
  const next = fixMode
    ? adjacentInvalidIndex(invalidRows, idx, 'next')
    : sequentialNext;
  const showError = hasField('errorReason', draft, row);
  const metaCols = splitUrl ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3';

  const englishVisible = ENGLISH_TESTS.some(
    (t) =>
      hasField(t.overall, draft, row) || hasField(t.section, draft, row),
  );

  const fieldErrorList = Object.entries(displayFieldErrors).filter(([, msg]) =>
    msg?.trim(),
  );

  const catalogPublished =
    publishReadiness?.status === 'PUBLISHED' || batch?.status === 'PUBLISHED';

  function renderIdentityLayout() {
    const showCourseUrlField = hasField('courseUrlExternal', draft, row);

    if (splitUrl) {
      return (
        <div className="flex flex-col gap-2">
          <Cell fieldKey="uniName" fitWidth boxClassName="w-full max-w-full" />
          <Cell fieldKey="programmeName" fitWidth boxClassName="w-full max-w-full" />
          <Cell fieldKey="courseName" fitWidth boxClassName="w-full max-w-full" />
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <Cell fieldKey="degreeName" fitWidth inputClassName="tabular-nums" />
            <Cell fieldKey="intakeInfo" fitWidth boxClassName="max-w-full" />
            <Cell
              fieldKey="courseDuration"
              fitWidth
              inputClassName="tabular-nums"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <Cell fieldKey="uniName" fitWidth boxClassName="max-w-full" />
          <Cell fieldKey="programmeName" fitWidth boxClassName="max-w-full" />
          <Cell fieldKey="courseName" fitWidth boxClassName="max-w-full" />
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <Cell
            fieldKey="degreeName"
            fitWidth
            inputClassName="tabular-nums"
          />
          <Cell
            fieldKey="intakeInfo"
            fitWidth
            boxClassName="min-w-[10rem] max-w-[36ch]"
          />
          <Cell
            fieldKey="courseDuration"
            fitWidth
            inputClassName="tabular-nums"
          />
        </div>
        {showCourseUrlField && (
          <Cell
            fieldKey="courseUrlExternal"
            multiline
            boxClassName="w-full min-w-0"
          />
        )}
      </div>
    );
  }

  if (showSplash) {
    return (
      <LoadingSplash
        title="Loading university data"
        subtitle="Opening course batch…"
      />
    );
  }

  if (!row || !batch) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={exitUniversity}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            ← Exit university
          </button>
          <p className="truncate text-sm font-semibold text-slate-900">
            {batch?.universityKey}
            <span className="font-normal text-slate-600">
              {' '}
              · {idx}
              {batch ? ` / ${batch.rowCount}` : ''}
            </span>
            {row && (
              <span
                className={
                  row.isValid
                    ? ' ml-1.5 text-emerald-600'
                    : ' ml-1.5 text-amber-600'
                }
              >
                {row.isValid ? 'Valid' : 'Errors'}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void goToRowNumber(jumpRowInput);
            }}
          >
            <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
              Row
              <input
                type="number"
                min={1}
                max={batch.rowCount}
                inputMode="numeric"
                aria-label={`Go to row 1–${batch.rowCount}`}
                className="w-14 rounded border border-slate-300 px-1 py-0.5 text-center text-xs font-bold tabular-nums"
                value={jumpRowInput}
                onChange={(e) => setJumpRowInput(e.target.value)}
                onBlur={() => {
                  if (jumpRowInput.trim() === '') {
                    setJumpRowInput(String(idx));
                  }
                }}
              />
            </label>
            <button
              type="submit"
              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold"
            >
              Go
            </button>
          </form>
          {prev && (
            <Link
              to={`/work/${batchId}/rows/${prev}`}
              onClick={() => void flushSave()}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold"
            >
              {fixMode ? 'Prev issue' : 'Prev'}
            </Link>
          )}
          {next && (
            <Link
              to={`/work/${batchId}/rows/${next}`}
              onClick={() => void flushSave()}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold"
            >
              {fixMode ? 'Next issue' : 'Next'}
            </Link>
          )}
          {fixMode && (
            <span className="text-xs font-bold text-amber-700">
              {invalidRows.length} to fix
            </span>
          )}
          {batch?.universityKey && (
            <button
              type="button"
              onClick={() => setHelpersOpen(true)}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold"
            >
              Helpers
            </button>
          )}
          {publishReadiness?.canPublish && (
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishToCatalog()}
              className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {publishing ? 'Publishing…' : 'Publish catalog'}
            </button>
          )}
          {publishReadiness?.status === 'PUBLISHED' && (
            <span className="text-xs font-bold text-emerald-700">Published</span>
          )}
          {!next &&
            !fixMode &&
            batch &&
            idx >= batch.rowCount && (
            <button
              type="button"
              onClick={exitUniversity}
              className="rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-700"
            >
              Finish
            </button>
          )}
          {courseUrl && (
            <button
              type="button"
              className="rounded bg-slate-700 px-2 py-0.5 text-xs text-white"
              onClick={() => setSplitUrl((v) => !v)}
            >
              {splitUrl ? 'Close URL' : 'URL'}
            </button>
          )}
          <span
            className={`text-xs ${
              saveState === 'error'
                ? 'text-red-600'
                : saveState === 'saved'
                  ? 'text-emerald-600'
                  : 'text-slate-500'
            }`}
          >
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? 'Save failed'
                  : 'Auto-save'}
          </span>
        </div>
      </header>

      {publishNotice && (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2"
          role="status"
        >
          <p className="text-sm font-bold text-emerald-950">
            {publishNotice.message}{' '}
            {publishNotice.coursesCreated} courses · {publishNotice.intakesCreated}{' '}
            intakes · {publishNotice.scholarshipsCreated} scholarships ·{' '}
            {publishNotice.engReqsCreated} course English rules ·{' '}
            {publishNotice.uniAcademicReqsCreated} uni academic ·{' '}
            {publishNotice.uniEngReqsCreated} uni English.
          </p>
          <button
            type="button"
            onClick={() => setPublishNotice(null)}
            className="text-xs font-bold text-emerald-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {catalogPublished && (
        <div
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-950"
          role="status"
        >
          Catalog published — this batch is view-only. Use{' '}
          <strong>Re-import</strong> on the universities page to load a new staging
          batch if you need to edit again.
        </div>
      )}

      {fieldErrorList.length > 0 && (
        <div
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5"
          role="alert"
        >
          <p className="text-sm font-bold text-amber-950">
            Fix {fieldErrorList.length} field
            {fieldErrorList.length === 1 ? '' : 's'} on this row:
          </p>
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-y-auto text-sm font-bold text-amber-950/90">
            {fieldErrorList.map(([key, msg]) => (
              <li key={key}>
                <span>{LABELS[key] ?? key}</span>
                {' — '}
                {msg}
                {hintForField(key) ? (
                  <span className="block pl-4 text-amber-800/90 not-italic">
                    Hint: {hintForField(key)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <form
          id="row-editor-form"
          onSubmit={(e) => e.preventDefault()}
          className={`flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden p-2 ${
            splitUrl ? 'w-1/2' : 'w-full'
          }`}
        >
          <fieldset
            disabled={catalogPublished}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 border-0 p-0 disabled:opacity-90"
          >
          <section className="shrink-0 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            {renderIdentityLayout()}

            <div className="flex w-full flex-wrap items-start gap-2">
              <div
                className="rounded border border-violet-200/80 bg-violet-50/40 p-1.5"
              >
                <p className="mb-0.5 text-sm font-bold uppercase tracking-wide text-violet-800/80">
                  Academic
                </p>
                <div
                  className="grid grid-cols-[2rem_minmax(4.5rem,1fr)_minmax(3.5rem,1fr)] items-center gap-x-1.5 gap-y-0.5"
                >
                  <span />
                  <span className="text-sm font-bold text-slate-600">Deg</span>
                  <span className="text-sm font-bold text-slate-600">GPA</span>
                  <span className="text-sm font-bold text-slate-600">Min</span>
                  <MiniInput fieldKey="minDegreeName" />
                  <MiniInput fieldKey="minGpa" />
                  <span className="text-sm font-bold text-slate-600">Hi</span>
                  <MiniInput fieldKey="higherDegreeName" />
                  <MiniInput fieldKey="higherGpa" />
                </div>
              </div>

              {englishVisible && (
                <div
                  className="rounded border border-sky-200/80 bg-sky-50/40 p-1.5"
                >
                  <p className="mb-0.5 text-sm font-bold uppercase tracking-wide text-sky-800/80">
                    English
                  </p>
                  <div
                    className="grid grid-cols-[2rem_minmax(3.25rem,1fr)_minmax(3.25rem,1fr)_minmax(3.25rem,1fr)] items-center gap-x-1.5 gap-y-0.5"
                  >
                    <span />
                    {ENGLISH_TESTS.map((test) => {
                      const show =
                        hasField(test.overall, draft, row) ||
                        hasField(test.section, draft, row);
                      if (!show) return null;
                      return (
                        <span
                          key={`${test.name}-h`}
                          className="text-center text-sm font-bold text-sky-900/80"
                        >
                          {test.name}
                        </span>
                      );
                    })}
                    <span className="text-sm font-bold text-slate-600">Over</span>
                    {ENGLISH_TESTS.map((test) => {
                      const show =
                        hasField(test.overall, draft, row) ||
                        hasField(test.section, draft, row);
                      if (!show) return null;
                      return (
                        <MiniInput key={`${test.name}-o`} fieldKey={test.overall} />
                      );
                    })}
                    <span className="text-sm font-bold text-slate-600">Min</span>
                    {ENGLISH_TESTS.map((test) => {
                      const show =
                        hasField(test.overall, draft, row) ||
                        hasField(test.section, draft, row);
                      if (!show) return null;
                      return (
                        <MiniInput key={`${test.name}-m`} fieldKey={test.section} />
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                className="flex max-w-full flex-col gap-1 rounded border border-amber-200/80 bg-amber-50/35 p-1.5"
              >
                <p className="text-sm font-bold uppercase tracking-wide text-amber-900/70">
                  Scholarship
                </p>
                <Cell fieldKey="scholarshipName" fitWidth boxClassName="max-w-full" />
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <Cell
                    fieldKey="scholarshipAmount"
                    fitWidth
                    inputClassName="tabular-nums"
                  />
                  <Cell fieldKey="scholarshipType" fitWidth />
                </div>
              </div>
            </div>

            {/* Row 4: Fees — full width, no gap on the right */}
            <div
              className="rounded-md border border-emerald-200/70 bg-emerald-50/30 p-1.5"
            >
              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-emerald-900/70">
                Fees
              </p>
              <div className="flex w-full flex-wrap items-end gap-x-3 gap-y-2">
                <Cell
                  fieldKey="tuitionFee"
                  fitWidth
                  inputClassName="tabular-nums"
                />
                <Cell fieldKey="currency" fitWidth />
                <Cell
                  fieldKey="initialDeposit"
                  fitWidth
                  inputClassName="tabular-nums"
                />
                <Cell
                  fieldKey="applicationFee"
                  fitWidth
                  inputClassName="tabular-nums"
                />
                <Cell
                  fieldKey="commission"
                  fitWidth
                  inputClassName="tabular-nums"
                />
                <Cell fieldKey="applicationDeadline" fitWidth />
              </div>
            </div>
          </section>

          <div className={`grid min-h-0 flex-1 gap-1.5 ${metaCols}`}>
            {renderMetaPanel(
              'AcademicRequirementsMetaData',
              'Academic requirements',
              'ring-1 ring-violet-100',
            )}
            {renderMetaPanel('feesMetaData', 'Fees detail', 'ring-1 ring-emerald-100')}
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              {renderMetaPanel(
                'scholarshipMetaData',
                'Scholarship detail',
                'ring-1 ring-amber-100',
              )}
              {showError && (
                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <header className="shrink-0 border-b border-slate-100 px-2 py-1">
                    <h2 className="text-sm font-bold text-slate-800">
                      Review
                    </h2>
                  </header>
                  <textarea
                    className={inputClass(
                      'errorReason',
                      'min-h-0 flex-1 resize-none border-0 px-2 py-1 text-sm font-bold',
                    )}
                    value={draft.errorReason ?? ''}
                    onChange={(e) => setField('errorReason', e.target.value)}
                    onBlur={() => void flushSave()}
                  />
                </section>
              )}
            </div>
          </div>
          </fieldset>
        </form>

        {splitUrl && courseUrl && <CourseUrlReferencePanel url={courseUrl} />}
      </div>

      {batch?.universityKey && (
        <UniversityHelpersPanel
          universityKey={batch.universityKey}
          open={helpersOpen}
          onClose={() => setHelpersOpen(false)}
        />
      )}
    </div>
  );
}
