import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FieldErrorTooltip } from '../components/FieldErrorTooltip';
import { LoadingSplash } from '../components/LoadingSplash';
import { UniversityHelpersPanel } from '../components/UniversityHelpersPanel';
import { CourseUrlReferencePanel } from '../components/CourseUrlReferencePanel';
import { apiFetch } from '../lib/api';
import {
  adjacentInvalidIndex,
  fetchInvalidRowIndexes,
  resolveInitialRowIndex,
} from '../lib/batchInvalidRows';
import {
  isCourseRowFieldRequired,
  validateCourseRowScoreAndCompleteness,
} from '../lib/courseRowFieldValidation';
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

const IDENTITY_PLACEHOLDERS: Record<string, string> = {
  uniName: 'Enter uni name',
  programmeName: 'Enter programme name',
  courseName: 'Enter course name',
};

function RequiredMark({
  fieldKey,
  className = 'ml-0.5',
}: {
  fieldKey: string;
  className?: string;
}) {
  if (!isCourseRowFieldRequired(fieldKey)) return null;
  return (
    <span className={`${className} text-red-600`} aria-hidden title="Required">
      *
    </span>
  );
}

const ENGLISH_TESTS = [
  { name: 'IELTS', overall: 'ieltsMinOverall', section: 'ieltsMinSection' },
  { name: 'TOEFL', overall: 'toeflMinOverall', section: 'toeflMinSection' },
  { name: 'PTE', overall: 'pteMinOverall', section: 'pteMinSection' },
] as const;

/** Wait after last keystroke before auto-save (finish typing / full word). */
const AUTO_SAVE_IDLE_MS = 800;
/** After a word delimiter (space, comma…), save a little sooner. */
const AUTO_SAVE_AFTER_WORD_MS = 400;

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

function sameFields(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
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
  const [activeMetaTab, setActiveMetaTab] = useState('');
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const loadedBatchIdRef = useRef<string | null>(null);
  /** Row number whose data is in the form (differs from the URL row while a new row loads). */
  const shownIdxRef = useRef<number | null>(null);
  /** Last fields known to be saved (or requested) for the shown row. */
  const lastSavedRef = useRef<Record<string, string>>({});
  /** Saves waiting for the one in flight, keyed by row number. */
  const pendingSavesRef = useRef(new Map<number, Record<string, string>>());
  /** Row + fields of an autosave timer that has not fired yet. */
  const scheduledRef = useRef<{
    idx: number;
    fields: Record<string, string>;
  } | null>(null);
  const loadSeqRef = useRef(0);
  const batchRowCountRef = useRef<number | undefined>(undefined);

  batchRowCountRef.current = batch?.rowCount;

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
    const seq = ++loadSeqRef.current;
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
        if (seq !== loadSeqRef.current) return;
        const pretty = prettifyMetaFields(r.fields);
        loadedBatchIdRef.current = batchId;
        shownIdxRef.current = targetIdx;
        lastSavedRef.current = pretty;
        draftRef.current = pretty;
        setBatch(b);
        setRow(r);
        setDraft(pretty);
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
        // A newer row was requested while this one was loading.
        if (seq !== loadSeqRef.current) return;
        const pretty = prettifyMetaFields(r.fields);
        shownIdxRef.current = idx;
        lastSavedRef.current = pretty;
        draftRef.current = pretty;
        setRow(r);
        setDraft(pretty);
        setSaveState('idle');
        updateWorkSessionRow(idx, batchRowCountRef.current);
      }
    } catch (e) {
      if (openingBatch) {
        setShowSplash(false);
      }
      throw e;
    }
  }, [batchId, idx, navigate, refreshPublishReadiness]);

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

  /**
   * Saves a row. Always saves to `targetIdx` (never to whatever row is on screen
   * now), queues while another save is running, and never overwrites text the
   * user typed after the request was sent.
   */
  const persistRow = useCallback(
    async (targetIdx: number, fields: Record<string, string>) => {
      if (!batchId) return;
      if (shownIdxRef.current === targetIdx) {
        lastSavedRef.current = fields;
      }
      pendingSavesRef.current.set(targetIdx, fields);
      if (savingRef.current) return;

      savingRef.current = true;
      let didSave = false;
      try {
        for (; ;) {
          const entry = pendingSavesRef.current.entries().next();
          if (entry.done) break;
          const [saveIdx, sent] = entry.value;
          pendingSavesRef.current.delete(saveIdx);
          const onScreen = () => shownIdxRef.current === saveIdx;

          if (onScreen()) setSaveState('saving');
          try {
            const updated = await apiFetch<RowResponse>(
              `/data-entry/batches/${batchId}/rows/${saveIdx}`,
              { method: 'PATCH', body: JSON.stringify({ fields: sent }) },
            );
            didSave = true;
            // Only refresh errors/status if the user has not typed since.
            if (onScreen() && draftRef.current === sent) {
              setRow(updated);
              setSaveState('saved');
            }
          } catch {
            if (onScreen()) {
              lastSavedRef.current = {};
              setSaveState('error');
            }
          }
        }
      } finally {
        savingRef.current = false;
      }

      if (didSave) {
        try {
          const b = await apiFetch<BatchResponse>(
            `/data-entry/batches/${batchId}`,
          );
          setBatch(b);
          await refreshPublishReadiness();
        } catch {
          /* counts refresh on the next save */
        }
      }
    },
    [batchId, refreshPublishReadiness],
  );

  const persistRowRef = useRef(persistRow);
  persistRowRef.current = persistRow;

  const scheduleSave = useCallback(
    (fields: Record<string, string>, opts?: { wordCompleted?: boolean }) => {
      const rowAtEdit = shownIdxRef.current;
      if (rowAtEdit === null) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      const delay = opts?.wordCompleted
        ? AUTO_SAVE_AFTER_WORD_MS
        : AUTO_SAVE_IDLE_MS;
      scheduledRef.current = { idx: rowAtEdit, fields };
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        scheduledRef.current = null;
        void persistRowRef.current(rowAtEdit, fields);
      }, delay);
    },
    [],
  );

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    scheduledRef.current = null;
    const rowOnScreen = shownIdxRef.current;
    if (rowOnScreen === null) return;
    const fields = draftRef.current;
    if (sameFields(fields, lastSavedRef.current)) return;
    await persistRow(rowOnScreen, fields);
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

  // When the row changes (or the page closes), send any edit still waiting on the timer.
  useEffect(() => {
    return () => {
      const waiting = scheduledRef.current;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      scheduledRef.current = null;
      if (waiting) {
        void persistRowRef.current(waiting.idx, waiting.fields);
      }
    };
  }, [idx]);

  function setField(key: string, value: string) {
    const prev = draftRef.current[key] ?? '';
    const wordCompleted =
      value.length > 0 &&
      value.length >= prev.length &&
      endsWordDelimiter(value);
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    scheduleSave(next, { wordCompleted });
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
      invalid
        ? isCourseRowFieldRequired(key)
          ? 'border-red-400 bg-red-50'
          : 'border-amber-400 bg-amber-50'
        : 'border-slate-300/80 bg-white',
      extra,
    ].join(' ');
  }

  function fieldTooltipProps(fieldKey: string, jsonError?: string | null) {
    return {
      fieldKey,
      message: displayFieldErrors[fieldKey],
      jsonError,
    };
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
      <FieldErrorTooltip {...fieldTooltipProps(fieldKey)} className="min-w-0">
        <input
          className={inputClass(
            fieldKey,
            `h-8 w-full min-w-[2.75rem] px-1 text-center text-sm font-bold tabular-nums ${className}`,
          )}
          value={draft[fieldKey] ?? ''}
          onChange={(e) => setField(fieldKey, e.target.value)}
          onBlur={() => void flushSave()}
          aria-invalid={Boolean(displayFieldErrors[fieldKey])}
        />
      </FieldErrorTooltip>
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
          <RequiredMark fieldKey={fieldKey} />
        </span>
        <FieldErrorTooltip {...fieldTooltipProps(fieldKey)} className="w-full">
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
              aria-invalid={Boolean(displayFieldErrors[fieldKey])}
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
              aria-invalid={Boolean(displayFieldErrors[fieldKey])}
            />
          )}
        </FieldErrorTooltip>
      </label>
    );
  }

  function handleMetaBlur(key: string) {
    const raw = draftRef.current[key] ?? '';
    const pretty = prettifyJson(raw);
    if (pretty !== raw) {
      const next = { ...draftRef.current, [key]: pretty };
      draftRef.current = next;
      setDraft(next);
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
    return (
      <section
        key={key}
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-sm ${serverErr || jsonErr
            ? isCourseRowFieldRequired(key)
              ? 'border-red-200 bg-white'
              : 'border-amber-200 bg-amber-50'
            : 'border-slate-200 bg-white'
          } ${tint}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-2 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="text-sm font-bold text-slate-800">
              {title}
              <RequiredMark fieldKey={key} />
            </h2>
            {(serverErr || jsonErr) && (
              <FieldErrorTooltip
                fieldKey={key}
                message={serverErr}
                jsonError={jsonErr}
              >
                <span
                  className={`cursor-help rounded px-1 py-0.5 text-xs font-bold ${isCourseRowFieldRequired(key)
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-800'
                    }`}
                  tabIndex={0}
                >
                  !
                </span>
              </FieldErrorTooltip>
            )}
          </div>
          <button
            type="button"
            onClick={() => formatMetaField(key)}
            className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Format JSON
          </button>
        </header>
        <FieldErrorTooltip
          fieldKey={key}
          message={serverErr}
          jsonError={jsonErr}
          className="flex min-h-0 flex-1 flex-col"
        >
          <textarea
            className={inputClass(
              key,
              `min-h-0 flex-1 resize-none border-0 px-2 py-2 font-mono text-sm font-bold leading-relaxed whitespace-pre shadow-none focus:ring-1 focus:ring-slate-300 ${jsonErr && value.trim() ? 'bg-red-50/50' : 'bg-slate-50/40'
              }`,
            )}
            value={value}
            onChange={(e) => setField(key, e.target.value)}
            onBlur={() => handleMetaBlur(key)}
            spellCheck={false}
            aria-invalid={Boolean(serverErr || jsonErr)}
          />
        </FieldErrorTooltip>
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

  const metaTabs = useMemo(() => {
    const tabs: { key: string; label: string; tint: string; title: string }[] =
      [];
    if (hasField('AcademicRequirementsMetaData', draft, row)) {
      tabs.push({
        key: 'AcademicRequirementsMetaData',
        label: 'Academic',
        title: 'Academic requirements',
        tint: 'ring-1 ring-violet-100',
      });
    }
    if (hasField('feesMetaData', draft, row)) {
      tabs.push({
        key: 'feesMetaData',
        label: 'Fees',
        title: 'Fees detail',
        tint: 'ring-1 ring-emerald-100',
      });
    }
    if (hasField('scholarshipMetaData', draft, row)) {
      tabs.push({
        key: 'scholarshipMetaData',
        label: 'Scholarship',
        title: 'Scholarship detail',
        tint: 'ring-1 ring-amber-100',
      });
    }
    if (showError) {
      tabs.push({
        key: 'errorReason',
        label: 'Review',
        title: 'Review',
        tint: '',
      });
    }
    return tabs;
  }, [draft, row, showError]);

  useEffect(() => {
    if (!metaTabs.length) return;
    if (!metaTabs.some((t) => t.key === activeMetaTab)) {
      setActiveMetaTab(metaTabs[0].key);
    }
  }, [metaTabs, activeMetaTab, idx]);

  const englishVisible = ENGLISH_TESTS.some(
    (t) =>
      hasField(t.overall, draft, row) || hasField(t.section, draft, row),
  );

  const fieldErrorList = Object.entries(displayFieldErrors).filter(([, msg]) =>
    msg?.trim(),
  );
  const requiredErrorCount = fieldErrorList.filter(([key]) =>
    isCourseRowFieldRequired(key),
  ).length;
  const optionalErrorCount = fieldErrorList.length - requiredErrorCount;

  const catalogPublished =
    publishReadiness?.status === 'PUBLISHED' || batch?.status === 'PUBLISHED';

  function identityLineInput(fieldKey: string, textClass: string) {
    if (!hasField(fieldKey, draft, row)) return null;
    const value = draft[fieldKey] ?? '';
    return (
      <div className="flex min-w-0 items-center gap-1">
        <RequiredMark fieldKey={fieldKey} className="shrink-0" />
        <FieldErrorTooltip
          {...fieldTooltipProps(fieldKey)}
          className="block min-w-0 flex-1"
        >
          <input
            className={inputClass(
              fieldKey,
              `w-full min-w-0 border-0 bg-transparent px-0 py-0 shadow-none focus:rounded focus:ring-1 focus:ring-slate-300 ${textClass}`,
            )}
            value={value}
            onChange={(e) => setField(fieldKey, e.target.value)}
            onBlur={() => void flushSave()}
            placeholder={IDENTITY_PLACEHOLDERS[fieldKey]}
            aria-label={LABELS[fieldKey] ?? fieldKey}
            aria-invalid={Boolean(displayFieldErrors[fieldKey])}
          />
        </FieldErrorTooltip>
      </div>
    );
  }

  function identityMiniField(fieldKey: string, boxClass = '') {
    if (!hasField(fieldKey, draft, row)) return null;
    const label = LABELS[fieldKey] ?? fieldKey;
    const value = draft[fieldKey] ?? '';
    return (
      <div className={`flex min-w-0 flex-col gap-0 ${boxClass}`}>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {label}
          <RequiredMark fieldKey={fieldKey} />
        </span>
        <FieldErrorTooltip {...fieldTooltipProps(fieldKey)} className="min-w-0">
          <input
            className={inputClass(
              fieldKey,
              'h-7 w-full min-w-[3rem] px-1 text-sm font-bold tabular-nums',
            )}
            value={value}
            onChange={(e) => setField(fieldKey, e.target.value)}
            onBlur={() => void flushSave()}
            aria-invalid={Boolean(displayFieldErrors[fieldKey])}
          />
        </FieldErrorTooltip>
      </div>
    );
  }

  function renderIdentitySummary() {
    const showCourseUrlField =
      !splitUrl && hasField('courseUrlExternal', draft, row);
    const hasIdentity =
      hasField('uniName', draft, row) ||
      hasField('programmeName', draft, row) ||
      hasField('courseName', draft, row);

    if (!hasIdentity) return null;

    return (
      <div className="flex flex-col gap-2">
        <div
          className="min-w-0 rounded-md border border-slate-200 bg-slate-50/90 p-2 shadow-sm"
          aria-label="Course identity"
        >
          {identityLineInput(
            'uniName',
            'text-sm font-bold leading-snug text-slate-900',
          )}
          {identityLineInput(
            'programmeName',
            'text-sm font-semibold leading-snug text-slate-700',
          )}
          {identityLineInput(
            'courseName',
            'text-sm font-bold leading-snug text-slate-800',
          )}
          <div
            className="mt-1.5 grid grid-cols-[minmax(3.5rem,1fr)_minmax(0,1.6fr)_minmax(3.5rem,0.9fr)] gap-x-2 gap-y-1 border-t border-slate-200/80 pt-1.5"
          >
            {identityMiniField('degreeName')}
            {identityMiniField('intakeInfo')}
            {identityMiniField('courseDuration')}
          </div>
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
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={exitUniversity}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Exit university
          </button>

          <p className="truncate text-lg font-bold text-slate-900">
            {batch?.universityKey}
            <span className="font-medium text-slate-600">
              {' '}
              · {idx}
              {batch ? ` / ${batch.rowCount}` : ''}
            </span>

            {row && (
              <span
                className={
                  row.isValid
                    ? 'ml-2 text-emerald-600'
                    : 'ml-2 text-amber-600'
                }
              >
                {row.isValid ? 'Valid' : 'Errors'}
              </span>
            )}
          </p>
        </div>

        <nav
          aria-label="Course navigation"
          className="flex items-center justify-center gap-2"
        >
          {sequentialPrev ? (
            <Link
              to={`/work/${batchId}/rows/${sequentialPrev}`}
              onClick={() => void flushSave()}
              aria-label="Previous course"
              title="Previous course"
              className="inline-flex h-9 w-11 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Link>
          ) : (
            <span
              aria-hidden
              className="inline-flex h-9 w-11 items-center justify-center rounded border border-slate-200 text-slate-300"
            >
              <ChevronLeft className="h-5 w-5" />
            </span>
          )}

          {sequentialNext ? (
            <Link
              to={`/work/${batchId}/rows/${sequentialNext}`}
              onClick={() => void flushSave()}
              aria-label="Next course"
              title="Next course"
              className="inline-flex h-9 w-11 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Link>
          ) : (
            <span
              aria-hidden
              className="inline-flex h-9 w-11 items-center justify-center rounded border border-slate-200 text-slate-300"
            >
              <ChevronRight className="h-5 w-5" />
            </span>
          )}
        </nav>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void goToRowNumber(jumpRowInput);
            }}
          >
            <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              Row
              <input
                type="number"
                min={1}
                max={batch.rowCount}
                inputMode="numeric"
                aria-label={`Go to row 1–${batch.rowCount}`}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-sm font-bold tabular-nums"
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
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-bold hover:bg-slate-50"
            >
              Go
            </button>
          </form>

          {fixMode && prev && (
            <Link
              to={`/work/${batchId}/rows/${prev}`}
              onClick={() => void flushSave()}
              className="whitespace-nowrap rounded border border-slate-300 px-3 py-1.5 text-sm font-bold hover:bg-slate-50"
            >
              Prev issue
            </Link>
          )}

          {fixMode && next && (
            <Link
              to={`/work/${batchId}/rows/${next}`}
              onClick={() => void flushSave()}
              className="whitespace-nowrap rounded border border-slate-300 px-3 py-1.5 text-sm font-bold hover:bg-slate-50"
            >
              Next issue
            </Link>
          )}

          {fixMode && (
            <span className="whitespace-nowrap text-sm font-bold text-amber-700">
              {invalidRows.length} to fix
            </span>
          )}

          {batch?.universityKey && (
            <button
              type="button"
              onClick={() => setHelpersOpen(true)}
              className="whitespace-nowrap rounded border border-slate-300 px-3 py-1.5 text-sm font-bold hover:bg-slate-50"
            >
              Helpers
            </button>
          )}

          {publishReadiness?.canPublish && (
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishToCatalog()}
              className="whitespace-nowrap rounded bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {publishing ? 'Publishing…' : 'Publish catalog'}
            </button>
          )}

          {publishReadiness?.status === 'PUBLISHED' && (
            <span className="whitespace-nowrap text-sm font-bold text-emerald-700">
              Published
            </span>
          )}

          {!next && !fixMode && batch && idx >= batch.rowCount && (
            <button
              type="button"
              onClick={exitUniversity}
              className="whitespace-nowrap rounded border border-emerald-600 px-3 py-1.5 text-sm font-bold text-emerald-700"
            >
              Finish
            </button>
          )}

          {courseUrl && (
            <button
              type="button"
              className="whitespace-nowrap rounded bg-slate-700 px-3 py-1.5 text-sm font-bold text-white"
              onClick={() => setSplitUrl((v) => !v)}
            >
              {splitUrl ? 'Close URL' : 'URL'}
            </button>
          )}

          <span
            className={`whitespace-nowrap text-sm font-medium ${saveState === 'error'
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

      {requiredErrorCount > 0 && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-1">
          <p className="text-xs font-bold text-red-800">
            {requiredErrorCount} required to fix
            {optionalErrorCount > 0 ? `, ${optionalErrorCount} optional to check` : ''}
            {' '}— hover highlighted fields for details
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <form
          id="row-editor-form"
          onSubmit={(e) => e.preventDefault()}
          className={`flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden p-2 ${splitUrl ? 'w-1/2' : 'w-full'
            }`}
        >
          <fieldset
            disabled={catalogPublished}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 border-0 p-0 disabled:opacity-90"
          >
            <section className="shrink-0 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              {splitUrl ? (
                <div className="flex flex-col gap-2">
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_minmax(10rem,38%)] items-start gap-2"
                  >
                    <div className="min-w-0">{renderIdentitySummary()}</div>
                    <div
                      className="flex min-w-0 flex-col gap-1 rounded border border-amber-200/80 bg-amber-50/35 p-1.5"
                    >
                      <p className="text-sm font-bold uppercase tracking-wide text-amber-900/70">
                        Scholarship
                      </p>
                      <Cell
                        fieldKey="scholarshipName"
                        fitWidth
                        boxClassName="max-w-full"
                      />
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

                  <div
                    className={`grid items-start gap-2 ${englishVisible
                        ? 'grid-cols-2'
                        : 'grid-cols-1'
                      }`}
                  >
                    <div
                      className="min-w-0 rounded border border-violet-200/80 bg-violet-50/40 p-1.5"
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
                        <span className="text-sm font-bold text-slate-600">
                          Min
                          <RequiredMark fieldKey="minDegreeName" />
                        </span>
                        <MiniInput fieldKey="minDegreeName" />
                        <MiniInput fieldKey="minGpa" />
                        <span className="text-sm font-bold text-slate-600">Hi</span>
                        <MiniInput fieldKey="higherDegreeName" />
                        <MiniInput fieldKey="higherGpa" />
                      </div>
                    </div>

                    {englishVisible && (
                      <div
                        className="min-w-0 rounded border border-sky-200/80 bg-sky-50/40 p-1.5"
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
                                <RequiredMark fieldKey={test.overall} />
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
                              <MiniInput
                                key={`${test.name}-o`}
                                fieldKey={test.overall}
                              />
                            );
                          })}
                          <span className="text-sm font-bold text-slate-600">Min</span>
                          {ENGLISH_TESTS.map((test) => {
                            const show =
                              hasField(test.overall, draft, row) ||
                              hasField(test.section, draft, row);
                            if (!show) return null;
                            return (
                              <MiniInput
                                key={`${test.name}-m`}
                                fieldKey={test.section}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {renderIdentitySummary()}

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
                        <span className="text-sm font-bold text-slate-600">
                          Min
                          <RequiredMark fieldKey="minDegreeName" />
                        </span>
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
                                <RequiredMark fieldKey={test.overall} />
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
                </>
              )}

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

            {metaTabs.length > 0 && (
              <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div
                  className="flex shrink-0 flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50/80 p-1"
                  role="tablist"
                  aria-label="Metadata"
                >
                  {metaTabs.map((tab) => {
                    const jsonErr =
                      tab.key !== 'errorReason'
                        ? getJsonParseError(draft[tab.key] ?? '')
                        : null;
                    const serverErr = displayFieldErrors[tab.key];
                    const hasIssue = Boolean(serverErr || jsonErr);
                    const selected = activeMetaTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`rounded px-2 py-1 text-xs font-bold ${selected
                            ? 'bg-white text-slate-900 shadow ring-1 ring-slate-200'
                            : 'text-slate-600 hover:bg-white/70'
                          } ${hasIssue ? (isCourseRowFieldRequired(tab.key) ? 'text-red-700' : 'text-amber-700') : ''}`}
                        onClick={() => setActiveMetaTab(tab.key)}
                      >
                        {tab.label}
                        <RequiredMark fieldKey={tab.key} />
                        {hasIssue ? ' !' : ''}
                      </button>
                    );
                  })}
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-1" role="tabpanel">
                  {activeMetaTab === 'errorReason' && showError && (
                    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-slate-100">
                      <textarea
                        className={inputClass(
                          'errorReason',
                          'min-h-0 flex-1 resize-none border-0 px-2 py-2 text-sm font-bold',
                        )}
                        value={draft.errorReason ?? ''}
                        onChange={(e) => setField('errorReason', e.target.value)}
                        onBlur={() => void flushSave()}
                      />
                    </section>
                  )}
                  {metaTabs
                    .filter((t) => t.key !== 'errorReason')
                    .map((tab) =>
                      activeMetaTab === tab.key
                        ? renderMetaPanel(tab.key, tab.title, tab.tint)
                        : null,
                    )}
                </div>
              </div>
            )}
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
