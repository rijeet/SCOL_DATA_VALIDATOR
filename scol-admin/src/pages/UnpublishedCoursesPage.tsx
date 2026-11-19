import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgePercent,
  BookMarked,
  BookOpen,
  Building2,
  CalendarRange,
  ChevronRight,
  Globe,
  GraduationCap,
  Banknote,
  Languages,
  RefreshCw,
  X,
} from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { apiFetch } from '../lib/api';
import { AMOUNT_TYPES, normalizeCommissionType } from '../lib/amountTypes';
import { DEGREE_SEEDS } from '../lib/degreeSeeds';
import { setWorkSession } from '../lib/workSession';

type CountrySlice = {
  id: string;
  name: string;
  code: string | null;
  universityCount: number;
  courseCount: number;
  universities: { batchId: string; name: string; courseCount: number }[];
};

type Snapshot = {
  totals: { countries: number; universities: number; courses: number };
  countries: CountrySlice[];
  universities: { batchId: string; uniName: string }[];
  degrees: { name: string; levelOrder: number | null; courseCount: number }[];
  englishTests: {
    name: string;
    minScore: number | null;
    maxScore: number | null;
  }[];
  entryDegrees: {
    batchId: string;
    uniName: string;
    minDegreeName: string;
    highDegreeName: string | null;
    courseCount: number;
  }[];
  programmes: { name: string; courseCount: number }[];
  scholarships: {
    batchId: string;
    uniName: string;
    degreeName: string;
    name: string | null;
    amount: string | null;
    amountType: string | null;
    courseCount: number;
  }[];
  tuitionByUni?: {
    batchId: string;
    uniName: string;
    groups: {
      currency: string;
      amount: string;
      year: number;
      month: number;
      courseCount: number;
    }[];
  }[];
  englishByUni?: {
    batchId: string;
    uniName: string;
    tests: {
      name: string;
      groups: { overall: string; section: string; courseCount: number }[];
    }[];
  }[];
  intakesByUni: {
    batchId: string;
    uniName: string;
    intakes: { year: number; month: number; courseCount: number }[];
  }[];
};

type ToeflPreview = {
  hasOldScore: boolean;
  items: {
    kind: 'overall' | 'section';
    score: string;
    courseCount: number;
    suggested: string | null;
    status: 'mapped' | 'no-match';
  }[];
};

type ScholarshipMetaPreview = {
  clearGroups: { metadata: string; courseCount: number }[];
  missingGroups: { name: string; amount: string; courseCount: number }[];
};

type DegreeCourse = {
  batchId: string;
  rowIndex: number;
  rowCount: number;
  universityKey: string;
  uniName: string;
  courseName: string;
  programmeName: string | null;
  score?: string | null;
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function entryKey(row: {
  minDegreeName: string;
  highDegreeName: string | null;
}): string {
  return `${row.minDegreeName}\0${row.highDegreeName ?? ''}`;
}

export function UnpublishedCoursesPage() {
  const [payload, setPayload] = useState<Snapshot | null>(null);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedDegree, setSelectedDegree] = useState<string | null>(null);
  const [degreeCourses, setDegreeCourses] = useState<DegreeCourse[] | null>(
    null,
  );
  const [degreeLoading, setDegreeLoading] = useState(false);

  const [entryBatchId, setEntryBatchId] = useState('');
  const [fromEntryKey, setFromEntryKey] = useState('');
  const [toMin, setToMin] = useState('SSC');
  const [toHigh, setToHigh] = useState('');
  const [confirmEntry, setConfirmEntry] = useState(false);

  const [englishBatchId, setEnglishBatchId] = useState('');
  const [englishTestName, setEnglishTestName] = useState('');
  const [englishGroupKey, setEnglishGroupKey] = useState('');
  const [toEngOverall, setToEngOverall] = useState('');
  const [toEngSection, setToEngSection] = useState('');
  const [confirmEnglish, setConfirmEnglish] = useState(false);
  const [toeflPreview, setToeflPreview] = useState<ToeflPreview | null>(null);
  const [toeflOpen, setToeflOpen] = useState(false);
  const [toeflEdits, setToeflEdits] = useState<Record<string, string>>({});
  const [toeflBusy, setToeflBusy] = useState(false);
  const [schMetaPreview, setSchMetaPreview] = useState<ScholarshipMetaPreview | null>(
    null,
  );
  const [schMetaOpen, setSchMetaOpen] = useState(false);
  const [schMetaFills, setSchMetaFills] = useState<Record<string, string>>({});
  const [confirmSchMeta, setConfirmSchMeta] = useState(false);
  const [tuitionBatchId, setTuitionBatchId] = useState('');
  const [tuitionKey, setTuitionKey] = useState('');
  const [toFeeCurrency, setToFeeCurrency] = useState('');
  const [toFeeAmount, setToFeeAmount] = useState('');
  const [confirmTuition, setConfirmTuition] = useState(false);
  const [tuitionCourses, setTuitionCourses] = useState<DegreeCourse[] | null>(null);
  const [tuitionCoursesLoading, setTuitionCoursesLoading] = useState(false);
  const [englishCourses, setEnglishCourses] = useState<DegreeCourse[] | null>(
    null,
  );
  const [englishCoursesLoading, setEnglishCoursesLoading] = useState(false);
  const [programmeName, setProgrammeName] = useState<string | null>(null);
  const [programmeCourses, setProgrammeCourses] = useState<DegreeCourse[] | null>(
    null,
  );
  const [programmeCoursesLoading, setProgrammeCoursesLoading] = useState(false);
  const [scholarshipCourses, setScholarshipCourses] = useState<
    DegreeCourse[] | null
  >(null);
  const [scholarshipCoursesLoading, setScholarshipCoursesLoading] =
    useState(false);
  const [newProgramme, setNewProgramme] = useState('');
  const [confirmProgramme, setConfirmProgramme] = useState(false);

  const [schBatchId, setSchBatchId] = useState('');
  const [fromSchKey, setFromSchKey] = useState('');
  const [toSchName, setToSchName] = useState('');
  const [toSchAmount, setToSchAmount] = useState('');
  const [toSchType, setToSchType] = useState('AMOUNT');
  const [confirmSch, setConfirmSch] = useState(false);

  const [intakeBatchId, setIntakeBatchId] = useState('');
  const [fromIntake, setFromIntake] = useState('');
  const [intakeCourses, setIntakeCourses] = useState<DegreeCourse[] | null>(
    null,
  );
  const [intakeCoursesLoading, setIntakeCoursesLoading] = useState(false);
  const [toYear, setToYear] = useState(new Date().getFullYear());
  const [toMonth, setToMonth] = useState(9);
  const [confirmIntake, setConfirmIntake] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineFee, setDeadlineFee] = useState('');
  const [confirmDeadline, setConfirmDeadline] = useState(false);

  const selectedCountry =
    (payload?.countries ?? []).find((c) => c.id === selectedCountryId) ?? null;

  async function load() {
    const data = await apiFetch<Snapshot>('/data-entry/unpublished/snapshot');
    setPayload(data);
    setLoadedAt(new Date());
  }

  async function refresh() {
    setUpdating(true);
    setError(null);
    try {
      await load();
      setConfirmUpdate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  const entryUnis = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of payload?.entryDegrees ?? []) {
      map.set(row.batchId, row.uniName);
    }
    return [...map.entries()].map(([batchId, uniName]) => ({
      batchId,
      uniName,
    }));
  }, [payload]);

  const entryRows = useMemo(
    () =>
      (payload?.entryDegrees ?? []).filter((r) => r.batchId === entryBatchId),
    [payload, entryBatchId],
  );

  useEffect(() => {
    if (!entryBatchId && entryUnis[0]) setEntryBatchId(entryUnis[0].batchId);
  }, [entryBatchId, entryUnis]);

  const fromEntry = entryRows.find((r) => entryKey(r) === fromEntryKey);

  const schUnis = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of payload?.scholarships ?? []) {
      map.set(row.batchId, row.uniName);
    }
    return [...map.entries()].map(([batchId, uniName]) => ({
      batchId,
      uniName,
    }));
  }, [payload]);

  const schRows = useMemo(
    () => (payload?.scholarships ?? []).filter((r) => r.batchId === schBatchId),
    [payload, schBatchId],
  );

  useEffect(() => {
    if (!schBatchId && schUnis[0]) setSchBatchId(schUnis[0].batchId);
  }, [schBatchId, schUnis]);

  useEffect(() => {
    if (!programmeName) {
      setProgrammeCourses(null);
      return;
    }
    let cancelled = false;
    setProgrammeCoursesLoading(true);
    const params = new URLSearchParams({ name: programmeName });
    apiFetch<{ courses: DegreeCourse[] }>(
      `/data-entry/unpublished/programmes/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setProgrammeCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setProgrammeCourses([]);
          setError(
            e instanceof Error ? e.message : 'Failed to load programme courses',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProgrammeCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [programmeName]);

  const englishUnis = payload?.englishByUni ?? [];
  const selectedEnglishUni =
    englishUnis.find((u) => u.batchId === englishBatchId) ??
    englishUnis[0] ??
    null;
  const selectedEnglishTest =
    selectedEnglishUni?.tests.find((t) => t.name === englishTestName) ??
    selectedEnglishUni?.tests[0] ??
    null;
  const selectedEnglishGroup =
    selectedEnglishTest?.groups.find(
      (g) => `${g.overall}\0${g.section}` === englishGroupKey,
    ) ?? null;

  useEffect(() => {
    if (!selectedEnglishUni || !selectedEnglishTest || !selectedEnglishGroup) {
      setEnglishCourses(null);
      return;
    }
    let cancelled = false;
    setEnglishCoursesLoading(true);
    const params = new URLSearchParams({
      name: selectedEnglishTest.name,
      batchId: selectedEnglishUni.batchId,
      overall: selectedEnglishGroup.overall,
      section: selectedEnglishGroup.section,
    });
    apiFetch<{ courses: DegreeCourse[] }>(
      `/data-entry/unpublished/english-tests/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setEnglishCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setEnglishCourses([]);
          setError(
            e instanceof Error
              ? e.message
              : 'Failed to load English test courses',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setEnglishCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEnglishUni, selectedEnglishTest, selectedEnglishGroup]);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    apiFetch<ToeflPreview>('/data-entry/unpublished/english-tests/toefl-preview')
      .then((data) => {
        if (cancelled) return;
        setToeflPreview(data);
        setToeflEdits(Object.fromEntries(
          data.items.map((item) => [
            `${item.kind}\0${item.score}`,
            item.suggested ?? '',
          ]),
        ));
        if (!data.hasOldScore) setToeflOpen(false);
      })
      .catch(() => {
        if (!cancelled) setToeflPreview({ hasOldScore: false, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [payload, loadedAt]);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    apiFetch<ScholarshipMetaPreview>(
      '/data-entry/unpublished/scholarships/metadata-preview',
    )
      .then((data) => {
        if (cancelled) return;
        setSchMetaPreview(data);
        if (data.clearGroups.length === 0 && data.missingGroups.length === 0) {
          setSchMetaOpen(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSchMetaPreview({ clearGroups: [], missingGroups: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [payload, loadedAt]);

  const tuitionUnis = payload?.tuitionByUni ?? [];
  const selectedTuitionUni =
    tuitionUnis.find((u) => u.batchId === tuitionBatchId) ?? tuitionUnis[0] ?? null;
  const selectedTuition =
    selectedTuitionUni?.groups.find(
      (g) => `${g.currency}\0${g.amount}\0${g.year}\0${g.month}` === tuitionKey,
    ) ?? null;

  useEffect(() => {
    if (!selectedTuitionUni || !selectedTuition) {
      setTuitionCourses(null);
      return;
    }
    let cancelled = false;
    setTuitionCoursesLoading(true);
    const params = new URLSearchParams({
      batchId: selectedTuitionUni.batchId,
      currency: selectedTuition.currency,
      amount: selectedTuition.amount,
      year: String(selectedTuition.year),
      month: String(selectedTuition.month),
    });
    apiFetch<{ courses: DegreeCourse[] }>(
      `/data-entry/unpublished/tuition/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setTuitionCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setTuitionCourses([]);
          setError(e instanceof Error ? e.message : 'Failed to load tuition courses');
        }
      })
      .finally(() => {
        if (!cancelled) setTuitionCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTuitionUni, selectedTuition]);

  const fromSch = schRows.find(
    (r) =>
      `${r.degreeName}\0${r.name ?? ''}\0${r.amount ?? ''}\0${r.amountType ?? ''}` ===
      fromSchKey,
  );

  useEffect(() => {
    if (!fromSch) {
      setScholarshipCourses(null);
      return;
    }
    let cancelled = false;
    setScholarshipCoursesLoading(true);
    const params = new URLSearchParams({
      batchId: fromSch.batchId,
      degreeName: fromSch.degreeName,
      name: fromSch.name ?? '',
      amount: fromSch.amount ?? '',
      amountType: fromSch.amountType ?? '',
    });
    apiFetch<{ courses: DegreeCourse[] }>(
      `/data-entry/unpublished/scholarships/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setScholarshipCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setScholarshipCourses([]);
          setError(
            e instanceof Error
              ? e.message
              : 'Failed to load scholarship courses',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setScholarshipCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromSch]);

  const intakeUnis = payload?.intakesByUni ?? [];
  useEffect(() => {
    if (!intakeBatchId && intakeUnis[0]) setIntakeBatchId(intakeUnis[0].batchId);
  }, [intakeBatchId, intakeUnis]);
  const intakeUni = intakeUnis.find((u) => u.batchId === intakeBatchId);
  const selectedIntake = intakeUni?.intakes.find(
    (i) => `${i.year}-${i.month}` === fromIntake,
  );

  useEffect(() => {
    if (!intakeUni || !selectedIntake) {
      setIntakeCourses(null);
      return;
    }
    let cancelled = false;
    setIntakeCoursesLoading(true);
    const params = new URLSearchParams({
      batchId: intakeUni.batchId,
      year: String(selectedIntake.year),
      month: String(selectedIntake.month),
    });
    apiFetch<{ courses: DegreeCourse[] }>(
      `/data-entry/unpublished/intakes/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setIntakeCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setIntakeCourses([]);
          setError(e instanceof Error ? e.message : 'Failed to load intake courses');
        }
      })
      .finally(() => {
        if (!cancelled) setIntakeCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [intakeUni, selectedIntake]);

  async function openDegree(name: string) {
    setSelectedDegree(name);
    setDegreeCourses(null);
    setDegreeLoading(true);
    try {
      const data = await apiFetch<{ courses: DegreeCourse[] }>(
        `/data-entry/unpublished/degrees/${encodeURIComponent(name)}/courses`,
      );
      setDegreeCourses(data.courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load courses');
    } finally {
      setDegreeLoading(false);
    }
  }

  async function run(
    path: string,
    body: unknown,
    done: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ updated: number }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNotice(`${done} ${result.updated} course rows.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Unpublished courses
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {loadedAt
                ? `Last update ${loadedAt.toLocaleString()}`
                : 'No snapshot yet. Update loads imported universities and courses.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirmUpdate(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Update
          </button>
        </header>
        {error && !confirmUpdate && (
          <p className="mb-4 text-sm font-bold text-red-600">{error}</p>
        )}
        {!payload ? (
          <p className="font-bold text-slate-600">
            This page stays empty until you confirm Update.
          </p>
        ) : (
        <>
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <Kpi
            icon={<Globe className="h-5 w-5" aria-hidden />}
            label="Countries"
            value={payload?.totals?.countries ?? 0}
          />
          <Kpi
            icon={<Building2 className="h-5 w-5" aria-hidden />}
            label="Universities"
            value={payload?.totals?.universities ?? 0}
          />
          <Kpi
            icon={<BookOpen className="h-5 w-5" aria-hidden />}
            label="Courses"
            value={payload?.totals?.courses ?? 0}
          />
        </section>
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
            <Globe className="h-4 w-4" aria-hidden />
            Imported universities
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(payload?.countries ?? []).map((c) => {
              const active = selectedCountryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setSelectedCountryId((id) => (id === c.id ? null : c.id))
                  }
                  className={`rounded-xl border px-3 py-3 text-left ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">
                    {c.code || '—'}
                  </p>
                  <p className="mt-0.5 font-bold">{c.name}</p>
                  <p
                    className={`mt-1 text-xs font-bold ${
                      active ? 'text-slate-200' : 'text-slate-500'
                    }`}
                  >
                    {c.universityCount} unis · {c.courseCount} courses
                  </p>
                </button>
              );
            })}
          </div>
          {(payload?.countries ?? []).length === 0 && (
            <p className="text-sm font-bold text-slate-500">
              No imported course batches yet.
            </p>
          )}
          {selectedCountry && (
            <ul className="mt-3 max-h-48 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
              {selectedCountry.universities.map((u) => (
                <li
                  key={u.batchId}
                  className="flex justify-between gap-3 py-2 text-sm font-bold"
                >
                  <span className="text-slate-800">{u.name}</span>
                  <span className="text-slate-500">{u.courseCount} courses</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {error && (
          <p className="mb-4 text-sm font-bold text-rose-700">{error}</p>
        )}
        {notice && (
          <p className="mb-4 text-sm font-bold text-emerald-700">{notice}</p>
        )}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              <GraduationCap className="h-4 w-4" aria-hidden />
              Degree names
            </h2>
            {selectedDegree ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedDegree(null)}
                  className="mb-2 text-sm font-bold text-slate-600 hover:text-slate-900"
                >
                  ← {selectedDegree}
                </button>
                {degreeLoading && (
                  <p className="text-sm font-bold text-slate-500">Loading…</p>
                )}
                <ul className="max-h-64 overflow-y-auto text-sm">
                  {(degreeCourses ?? []).map((c) => (
                    <li key={`${c.batchId}:${c.rowIndex}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                        onClick={() => {
                          setWorkSession({
                            batchId: c.batchId,
                            rowIndex: c.rowIndex,
                            universityKey: c.universityKey,
                            rowCount: c.rowCount,
                          });
                          window.open(
                            `/work/${c.batchId}/rows/${c.rowIndex}`,
                            '_blank',
                            'noopener',
                          );
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{c.courseName}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {c.uniName}
                            {c.programmeName ? ` · ${c.programmeName}` : ''}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </li>
                  ))}
                  {!degreeLoading && (degreeCourses ?? []).length === 0 && (
                    <li className="font-bold text-slate-500">No courses</li>
                  )}
                </ul>
              </>
            ) : (
              <ul className="max-h-64 overflow-y-auto text-sm">
                {(payload?.degrees ?? []).map((d) => (
                  <li key={d.name}>
                    <button
                      type="button"
                      onClick={() => void openDegree(d.name)}
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                    >
                      <span>{d.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        {d.levelOrder != null
                          ? `Lvl ${d.levelOrder} · ${d.courseCount} courses`
                          : `${d.courseCount} courses`}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
                {(payload?.degrees ?? []).length === 0 && (
                  <li className="font-bold text-slate-500">None</li>
                )}
              </ul>
            )}
        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              <GraduationCap className="h-4 w-4" aria-hidden />
              Min / high degree
            </h2>
            <label className="mb-3 block text-sm font-bold text-slate-700">
              University
              <select
                className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                value={entryBatchId}
                onChange={(e) => {
                  setEntryBatchId(e.target.value);
                  setFromEntryKey('');
                }}
              >
                {entryUnis.length === 0 && (
                  <option value="">No entry degrees</option>
                )}
                {entryUnis.map((u) => (
                  <option key={u.batchId} value={u.batchId}>
                    {u.uniName}
                  </option>
                ))}
              </select>
            </label>
            <ul className="max-h-48 overflow-y-auto text-sm">
              {entryRows.map((r) => {
                const key = entryKey(r);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        setFromEntryKey(key);
                        setToMin(r.minDegreeName);
                        setToHigh(r.highDegreeName ?? '');
                      }}
                      className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold ${
                        key === fromEntryKey
                          ? 'text-emerald-800'
                          : 'text-slate-800'
                      }`}
                    >
                      <span>
                        Min {r.minDegreeName}
                        {r.highDegreeName
                          ? ` · High ${r.highDegreeName}`
                          : ' · High —'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.courseCount} courses
                      </span>
                    </button>
                  </li>
                );
              })}
              {entryRows.length === 0 && (
                <li className="font-bold text-slate-500">None</li>
              )}
            </ul>
            {fromEntry && (
              <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
                <button
                  type="button"
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                  aria-label="Close min/high editor"
                  onClick={() => setFromEntryKey('')}
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <p className="text-xs font-medium text-slate-600">
                  Changes min and high degree on matching course rows only.
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-sm font-bold text-slate-700">
                    New min
                    <select
                      className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      value={toMin}
                      onChange={(e) => setToMin(e.target.value)}
                    >
                      {DEGREE_SEEDS.map((d) => (
                        <option key={d.degreeName} value={d.degreeName}>
                          {d.degreeName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    New high
                    <select
                      className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      value={toHigh}
                      onChange={(e) => setToHigh(e.target.value)}
                    >
                      <option value="">None</option>
                      {DEGREE_SEEDS.map((d) => (
                        <option key={d.degreeName} value={d.degreeName}>
                          {d.degreeName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                    disabled={
                      toMin === fromEntry.minDegreeName &&
                      toHigh === (fromEntry.highDegreeName ?? '')
                    }
                    onClick={() => setConfirmEntry(true)}
                  >
                    Set min/high
                  </button>
                </div>
              </div>
            )}
        </section>

        <section className="mb-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              <BookMarked className="h-4 w-4" aria-hidden />
              Programme
            </h2>
            <ul className="max-h-48 overflow-y-auto text-sm">
              {(payload?.programmes ?? []).map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setProgrammeName(p.name);
                      setNewProgramme(p.name);
                    }}
                    className={`flex w-full items-center justify-between border-b border-slate-50 py-1.5 text-left font-bold ${
                      programmeName === p.name
                        ? 'text-emerald-800'
                        : 'text-slate-800'
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-slate-500">
                      {p.courseCount} courses
                    </span>
                  </button>
                </li>
              ))}
              {(payload?.programmes ?? []).length === 0 && (
                <li className="font-bold text-slate-500">None</li>
              )}
            </ul>
            {programmeName && (
              <ul className="mt-3 max-h-48 overflow-y-auto text-sm">
                {programmeCoursesLoading && (
                  <li className="font-bold text-slate-500">Loading courses…</li>
                )}
                {(programmeCourses ?? []).map((c) => (
                  <li key={`${c.batchId}:${c.rowIndex}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                      onClick={() => {
                        setWorkSession({
                          batchId: c.batchId,
                          rowIndex: c.rowIndex,
                          universityKey: c.universityKey,
                          rowCount: c.rowCount,
                        });
                        window.open(
                          `/work/${c.batchId}/rows/${c.rowIndex}`,
                          '_blank',
                          'noopener',
                        );
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{c.courseName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {c.uniName}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
                {!programmeCoursesLoading &&
                  (programmeCourses ?? []).length === 0 && (
                    <li className="font-bold text-slate-500">No courses</li>
                  )}
              </ul>
            )}
            {programmeName && (
              <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
                <button
                  type="button"
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                  aria-label="Close programme editor"
                  onClick={() => setProgrammeName(null)}
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <label className="text-sm font-bold text-slate-700">
                  New name
                  <input
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={newProgramme}
                    onChange={(e) => setNewProgramme(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  disabled={
                    !newProgramme.trim() ||
                    newProgramme.trim().toLowerCase() ===
                      programmeName.trim().toLowerCase()
                  }
                  onClick={() => setConfirmProgramme(true)}
                >
                  Rename programme
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              <BadgePercent className="h-4 w-4" aria-hidden />
              Scholarships
            </h2>
            <button
              type="button"
              onClick={() => setSchMetaOpen((open) => !open)}
              className="rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800"
            >
              Fix metadata
              {schMetaPreview
                ? ` (${
                    schMetaPreview.clearGroups.reduce((sum, group) => sum + group.courseCount, 0) +
                    schMetaPreview.missingGroups.reduce((sum, group) => sum + group.courseCount, 0)
                  })`
                : ''}
            </button>
          </div>
          {schMetaOpen && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">
                Amount 0 or no scholarship should have empty metadata. An amount above 0 needs metadata.
              </p>
              {schMetaPreview &&
                schMetaPreview.clearGroups.length === 0 &&
                schMetaPreview.missingGroups.length === 0 && (
                  <p className="text-sm font-bold text-emerald-800">Nothing to fix.</p>
                )}
              {!schMetaPreview && (
                <p className="text-sm font-bold text-slate-500">Checking courses…</p>
              )}
              {schMetaPreview?.clearGroups.map((group) => (
                <p key={group.metadata} className="mb-2 text-sm font-medium text-slate-700">
                  Clear metadata on {group.courseCount} courses with amount 0 or no scholarship.
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {group.metadata}
                  </span>
                </p>
              ))}
              {schMetaPreview?.missingGroups.map((group) => {
                const key = `${group.name}\0${group.amount}`;
                return (
                  <label key={key} className="mb-2 block text-sm font-bold text-slate-700">
                    {group.name || 'Scholarship'} · {group.amount} · {group.courseCount}
                    <textarea
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      rows={2}
                      placeholder='[{"subtitle":"…","description":["…"]}]'
                      value={schMetaFills[key] ?? ''}
                      onChange={(e) =>
                        setSchMetaFills((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                );
              })}
              <button
                type="button"
                disabled={
                  !schMetaPreview ||
                  (schMetaPreview.clearGroups.length === 0 &&
                    schMetaPreview.missingGroups.length === 0) ||
                  schMetaPreview.missingGroups.some(
                    (group) => !(schMetaFills[`${group.name}\0${group.amount}`] ?? '').trim(),
                  )
                }
                onClick={() => setConfirmSchMeta(true)}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Apply metadata
              </button>
            </div>
          )}
          <label className="mb-3 block text-sm font-bold text-slate-700">
            University
            <select
              className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={schBatchId}
              onChange={(e) => {
                setSchBatchId(e.target.value);
                setFromSchKey('');
              }}
            >
              {schUnis.length === 0 && <option value="">No scholarships</option>}
              {schUnis.map((u) => (
                <option key={u.batchId} value={u.batchId}>
                  {u.uniName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem_7rem_4.5rem] py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Scholarship</span>
            <span>Degree</span>
            <span className="text-right">Amount</span>
            <span className="pl-3">Type</span>
            <span className="text-right">Courses</span>
          </div>
          {schRows.map((s) => {
            const key = `${s.degreeName}\0${s.name ?? ''}\0${s.amount ?? ''}\0${s.amountType ?? ''}`;
            const typeLabel =
              AMOUNT_TYPES.find(
                (t) => t.typeCode === normalizeCommissionType(s.amountType ?? ''),
              )?.typeName ??
              s.amountType?.trim() ??
              '—';
            return (
              <button
                key={key}
                type="button"
                className={`grid w-full grid-cols-[minmax(0,1fr)_5rem_6.5rem_7rem_4.5rem] items-center border-t border-slate-100 py-2 text-left text-sm font-bold ${
                  key === fromSchKey ? 'text-emerald-800' : 'text-slate-800'
                }`}
                onClick={() => {
                  setFromSchKey(key);
                  setToSchName(s.name ?? '');
                  setToSchAmount(s.amount ?? '');
                  setToSchType(
                    normalizeCommissionType(s.amountType ?? '') ?? 'AMOUNT',
                  );
                }}
              >
                <span className="min-w-0 truncate pr-3">
                  {s.name?.trim() || 'No scholarship'}
                </span>
                <span>{s.degreeName}</span>
                <span className="text-right">{s.amount || '—'}</span>
                <span className="pl-3">{s.name ? typeLabel : '—'}</span>
                <span className="text-right text-slate-500">{s.courseCount}</span>
              </button>
            );
          })}
          {schRows.length === 0 && (
            <p className="py-3 text-sm font-bold text-slate-500">None</p>
          )}
          {fromSch && (
            <ul className="mt-3 max-h-48 overflow-y-auto text-sm">
              {scholarshipCoursesLoading && (
                <li className="font-bold text-slate-500">Loading courses…</li>
              )}
              {(scholarshipCourses ?? []).map((c) => (
                <li key={`${c.batchId}:${c.rowIndex}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                    onClick={() => {
                      setWorkSession({
                        batchId: c.batchId,
                        rowIndex: c.rowIndex,
                        universityKey: c.universityKey,
                        rowCount: c.rowCount,
                      });
                      window.open(
                        `/work/${c.batchId}/rows/${c.rowIndex}`,
                        '_blank',
                        'noopener',
                      );
                    }}
                  >
                    <span className="min-w-0 truncate">{c.courseName}</span>
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
              {!scholarshipCoursesLoading &&
                (scholarshipCourses ?? []).length === 0 && (
                  <li className="font-bold text-slate-500">No courses</li>
                )}
            </ul>
          )}
          {fromSch && (
            <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                aria-label="Close scholarship editor"
                onClick={() => setFromSchKey('')}
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm font-bold text-slate-700">
                  Name
                  <input
                    className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={toSchName}
                    onChange={(e) => setToSchName(e.target.value)}
                  />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Amount
                  <input
                    className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={toSchAmount}
                    onChange={(e) => setToSchAmount(e.target.value)}
                  />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Type
                  <select
                    className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={toSchType}
                    onChange={(e) => setToSchType(e.target.value)}
                  >
                    {AMOUNT_TYPES.map((t) => (
                      <option key={t.typeCode} value={t.typeCode}>
                        {t.typeName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
                  onClick={() => setConfirmSch(true)}
                >
                  Set scholarship
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
            <CalendarRange className="h-4 w-4" aria-hidden />
            Intake dates
          </h2>
          <label className="mb-3 block text-sm font-bold text-slate-700">
            University
            <select
              className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={intakeBatchId}
              onChange={(e) => {
                setIntakeBatchId(e.target.value);
                setFromIntake('');
              }}
            >
              {intakeUnis.length === 0 && <option value="">No intakes</option>}
              {intakeUnis.map((u) => (
                <option key={u.batchId} value={u.batchId}>
                  {u.uniName}
                </option>
              ))}
            </select>
          </label>
          {(intakeUni?.intakes ?? []).length === 0 && (
            <p className="text-sm font-bold text-slate-500">
              No intake dates in unpublished course rows.
            </p>
          )}
          <ul className="flex flex-wrap gap-2">
            {(intakeUni?.intakes ?? []).map((i) => {
              const key = `${i.year}-${i.month}`;
              const now = new Date();
              const past =
                i.year * 12 + i.month <
                now.getFullYear() * 12 + (now.getMonth() + 1);
              const selected = fromIntake === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      setFromIntake(key);
                      setToYear(i.year);
                      setToMonth(i.month);
                    }}
                    className={`rounded-full border px-3 py-1 text-sm font-bold ${
                      selected && past
                        ? 'border-red-700 bg-red-700 text-white'
                        : selected
                          ? 'border-emerald-700 text-emerald-800'
                          : past
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : 'border-slate-300 text-slate-800'
                    }`}
                  >
                    {MONTHS[i.month - 1]}-{String(i.year).slice(-2)} ·{' '}
                    {i.courseCount}
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedIntake && (
            <ul className="mt-3 max-h-64 overflow-y-auto text-sm">
              {intakeCoursesLoading && (
                <li className="font-bold text-slate-500">Loading courses…</li>
              )}
              {(intakeCourses ?? []).map((c) => (
                <li key={`${c.batchId}:${c.rowIndex}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                    onClick={() => {
                      setWorkSession({
                        batchId: c.batchId,
                        rowIndex: c.rowIndex,
                        universityKey: c.universityKey,
                        rowCount: c.rowCount,
                      });
                      window.open(
                        `/work/${c.batchId}/rows/${c.rowIndex}`,
                        '_blank',
                        'noopener',
                      );
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{c.courseName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.uniName}
                        {c.programmeName ? ` · ${c.programmeName}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
              {!intakeCoursesLoading && (intakeCourses ?? []).length === 0 && (
                <li className="font-bold text-slate-500">No courses</li>
              )}
            </ul>
          )}
          {selectedIntake && (
            <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                aria-label="Close intake editor"
                onClick={() => setFromIntake('')}
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm font-bold text-slate-700">
                  Month
                  <select
                    className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={toMonth}
                    onChange={(e) => setToMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Year
                  <input
                    type="number"
                    className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={toYear}
                    onChange={(e) => setToYear(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  disabled={
                    toYear === selectedIntake.year &&
                    toMonth === selectedIntake.month
                  }
                  onClick={() => setConfirmIntake(true)}
                >
                  Move intake
                </button>
              </div>
            </div>
          )}
          {selectedIntake && intakeUni && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-sm font-bold text-slate-800">
                Update deadline and application fee
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Applies to every unpublished course in{' '}
                {MONTHS[selectedIntake.month - 1]}-{String(selectedIntake.year).slice(-2)} at{' '}
                {intakeUni.uniName}. Leave a box blank to clear that value.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-sm font-bold text-slate-700">
                  Application deadline
                  <input
                    placeholder="MM/DD/YYYY"
                    className="mt-1 block w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                  />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Application fee
                  <input
                    placeholder="5500"
                    className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    value={deadlineFee}
                    onChange={(e) => setDeadlineFee(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  disabled={
                    (!deadlineDate.trim() && !deadlineFee.trim()) ||
                    (deadlineDate.trim() !== '' &&
                      !/^\d{2}\/\d{2}\/\d{4}$/.test(deadlineDate.trim())) ||
                    (deadlineFee.trim() !== '' &&
                      !/^\d+(\.\d+)?$/.test(deadlineFee.trim()))
                  }
                  onClick={() => setConfirmDeadline(true)}
                >
                  Update courses
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
            <Languages className="h-4 w-4" aria-hidden />
            English tests
          </h2>
          <button
            type="button"
            disabled={!toeflPreview?.hasOldScore}
            onClick={() => setToeflOpen(true)}
            className={`mb-3 text-sm font-bold ${
              toeflPreview?.hasOldScore
                ? 'text-emerald-800 hover:underline'
                : 'cursor-not-allowed text-slate-400'
            }`}
          >
            TOEFL scale
          </button>
          {toeflOpen && toeflPreview?.hasOldScore && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-xs font-bold uppercase text-slate-500">
                    <th className="border border-red-500 px-2 py-1">Stored</th>
                    <th className="border border-red-500 px-2 py-1">New 1–6</th>
                    <th className="border border-red-500 px-2 py-1">Courses</th>
                    <th className="border border-red-500 px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {toeflPreview.items.map((item) => {
                    const key = `${item.kind}\0${item.score}`;
                    const rowColor =
                      item.kind === 'overall' ? 'bg-amber-100' : 'bg-green-100';
                    return (
                      <tr key={key} className={rowColor}>
                        <td className="border border-red-500 px-2 py-1.5 font-bold">
                          {item.kind} {item.score}
                        </td>
                        <td className="border border-red-500 px-2">
                          <input
                            className="w-20 rounded border border-slate-300 bg-white px-2 py-1"
                            value={toeflEdits[key] ?? ''}
                            onChange={(e) =>
                              setToeflEdits((current) => ({
                                ...current,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="border border-red-500 px-2">{item.courseCount}</td>
                        <td className="border border-red-500 px-2 text-xs font-bold text-slate-500">
                          {item.status === 'no-match' ? 'No match' : 'Mapped'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button
                type="button"
                disabled={toeflBusy}
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                onClick={() => {
                  const missing = toeflPreview.items.some(
                    (item) => !(toeflEdits[`${item.kind}\0${item.score}`] ?? '').trim(),
                  );
                  if (missing) {
                    setError('Enter a 1–6 score for every TOEFL row.');
                    return;
                  }
                  setToeflBusy(true);
                  setError(null);
                  void apiFetch<{ updated: number }>(
                    '/data-entry/unpublished/english-tests/toefl-scale',
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        pairs: toeflPreview.items.map((item) => ({
                          kind: item.kind,
                          from: item.score,
                          to: toeflEdits[`${item.kind}\0${item.score}`],
                        })),
                      }),
                    },
                  )
                    .then(async (result) => {
                      setNotice(`Updated TOEFL scores on ${result.updated} course rows.`);
                      setToeflOpen(false);
                      await load();
                    })
                    .catch((e) => {
                      setError(e instanceof Error ? e.message : 'TOEFL update failed');
                    })
                    .finally(() => setToeflBusy(false));
                }}
              >
                Apply scale
              </button>
            </div>
          )}
          <label className="block text-sm font-bold text-slate-700">
            University
            <select
              className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
              value={selectedEnglishUni?.batchId ?? ''}
              onChange={(e) => {
                setEnglishBatchId(e.target.value);
                setEnglishTestName('');
                setEnglishGroupKey('');
              }}
            >
              {englishUnis.map((u) => (
                <option key={u.batchId} value={u.batchId}>
                  {u.uniName}
                </option>
              ))}
            </select>
          </label>
          {selectedEnglishUni ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedEnglishUni.tests.map((t) => {
                const active = selectedEnglishTest?.name === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      setEnglishTestName(t.name);
                      setEnglishGroupKey('');
                    }}
                    className={`rounded-full border px-3 py-1 text-sm font-bold ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-slate-500">
              No English scores in imported rows.
            </p>
          )}
          {selectedEnglishTest && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedEnglishTest.groups.map((g) => {
                const key = `${g.overall}\0${g.section}`;
                const active = englishGroupKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setEnglishGroupKey(key);
                      setToEngOverall(g.overall);
                      setToEngSection(g.section);
                    }}
                    className={`rounded-full border px-3 py-1 text-sm font-bold ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {g.overall}/{g.section} · {g.courseCount}
                  </button>
                );
              })}
            </div>
          )}
          {selectedEnglishGroup && (
            <ul className="mt-3 max-h-64 overflow-y-auto text-sm">
              {englishCoursesLoading && (
                <li className="font-bold text-slate-500">Loading courses…</li>
              )}
              {(englishCourses ?? []).map((c) => (
                <li key={`${c.batchId}:${c.rowIndex}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                    onClick={() => {
                      setWorkSession({
                        batchId: c.batchId,
                        rowIndex: c.rowIndex,
                        universityKey: c.universityKey,
                        rowCount: c.rowCount,
                      });
                      window.open(
                        `/work/${c.batchId}/rows/${c.rowIndex}`,
                        '_blank',
                        'noopener',
                      );
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{c.courseName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.uniName}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-slate-700">
                      {c.score || '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedEnglishGroup && selectedEnglishUni && selectedEnglishTest && (
            <div className="relative mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                aria-label="Close English score editor"
                onClick={() => setEnglishGroupKey('')}
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <label className="text-sm font-bold text-slate-700">
                Overall
                <input
                  className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={toEngOverall}
                  onChange={(e) => setToEngOverall(e.target.value)}
                />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Section min
                <input
                  className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={toEngSection}
                  onChange={(e) => setToEngSection(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                disabled={
                  toEngOverall.trim() === selectedEnglishGroup.overall &&
                  toEngSection.trim() === selectedEnglishGroup.section
                }
                onClick={() => setConfirmEnglish(true)}
              >
                Set score
              </button>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
            <Banknote className="h-4 w-4" aria-hidden />
            Tuition fees
          </h2>
          <label className="block text-sm font-bold text-slate-700">
            University
            <select
              className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
              value={selectedTuitionUni?.batchId ?? ''}
              onChange={(e) => {
                setTuitionBatchId(e.target.value);
                setTuitionKey('');
              }}
            >
              {tuitionUnis.map((u) => (
                <option key={u.batchId} value={u.batchId}>
                  {u.uniName}
                </option>
              ))}
            </select>
          </label>
          {selectedTuitionUni ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedTuitionUni.groups.map((g) => {
                const key = `${g.currency}\0${g.amount}\0${g.year}\0${g.month}`;
                const active = tuitionKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTuitionKey(key);
                      setToFeeCurrency(g.currency);
                      setToFeeAmount(g.amount);
                    }}
                    className={`rounded-full border px-3 py-1 text-sm font-bold ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {g.currency} {g.amount} · {MONTHS[g.month - 1]} {g.year} ·{' '}
                    {g.courseCount}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-slate-500">
              No tuition fees in imported rows.
            </p>
          )}
          {selectedTuition && (
            <ul className="mt-3 max-h-64 overflow-y-auto text-sm">
              {tuitionCoursesLoading && (
                <li className="font-bold text-slate-500">Loading courses…</li>
              )}
              {(tuitionCourses ?? []).map((c) => (
                <li key={`${c.batchId}:${c.rowIndex}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                    onClick={() => {
                      setWorkSession({
                        batchId: c.batchId,
                        rowIndex: c.rowIndex,
                        universityKey: c.universityKey,
                        rowCount: c.rowCount,
                      });
                      window.open(
                        `/work/${c.batchId}/rows/${c.rowIndex}`,
                        '_blank',
                        'noopener',
                      );
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{c.courseName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.uniName}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-slate-700">
                      {c.score || '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedTuition && selectedTuitionUni && (
            <div className="relative mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                aria-label="Close tuition editor"
                onClick={() => setTuitionKey('')}
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <label className="text-sm font-bold text-slate-700">
                Currency
                <input
                  className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={toFeeCurrency}
                  onChange={(e) => setToFeeCurrency(e.target.value)}
                />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Amount
                <input
                  className="mt-1 block w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={toFeeAmount}
                  onChange={(e) => setToFeeAmount(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                disabled={
                  toFeeCurrency.trim().toUpperCase() === selectedTuition.currency &&
                  toFeeAmount.trim() === selectedTuition.amount
                }
                onClick={() => setConfirmTuition(true)}
              >
                Set tuition
              </button>
            </div>
          )}
        </section>
        </>
        )}
      </div>

      <ConfirmDialog
        open={confirmUpdate}
        title="Load unpublished universities and courses?"
        confirmLabel="Update"
        busyLabel="Updating…"
        tone="primary"
        busy={updating}
        error={error}
        onCancel={() => {
          if (!updating) {
            setConfirmUpdate(false);
            setError(null);
          }
        }}
        onConfirm={() => void refresh()}
      >
        This reads the latest imported course batch for each university that is
        not published. It does not change course rows.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmTuition}
        title="Change this tuition fee?"
        confirmLabel="Set tuition"
        busy={busy}
        onCancel={() => setConfirmTuition(false)}
        onConfirm={() => {
          if (!selectedTuitionUni || !selectedTuition) return;
          void run(
            '/data-entry/unpublished/tuition/remap',
            {
              batchId: selectedTuitionUni.batchId,
              fromCurrency: selectedTuition.currency,
              fromAmount: selectedTuition.amount,
              year: selectedTuition.year,
              month: selectedTuition.month,
              toCurrency: toFeeCurrency,
              toAmount: toFeeAmount,
            },
            'Updated tuition on',
          ).then(() => {
            setConfirmTuition(false);
            setTuitionKey('');
          });
        }}
      >
        This rewrites tuition and currency on unpublished course rows only.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmEnglish}
        title="Change this English score?"
        confirmLabel="Set score"
        busy={busy}
        onCancel={() => setConfirmEnglish(false)}
        onConfirm={() => {
          if (!selectedEnglishUni || !selectedEnglishTest || !selectedEnglishGroup) {
            return;
          }
          void run(
            '/data-entry/unpublished/english-tests/remap',
            {
              batchId: selectedEnglishUni.batchId,
              testName: selectedEnglishTest.name,
              fromOverall: selectedEnglishGroup.overall,
              fromSection: selectedEnglishGroup.section,
              toOverall: toEngOverall,
              toSection: toEngSection,
            },
            'Updated English scores on',
          ).then(() => {
            setConfirmEnglish(false);
            setEnglishGroupKey('');
          });
        }}
      >
        This rewrites the overall and section score on unpublished course rows
        only.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmEntry}
        title="Update min/high degree?"
        busy={busy}
        onCancel={() => setConfirmEntry(false)}
        onConfirm={() => {
          if (!fromEntry) return;
          void run(
            '/data-entry/unpublished/courses/entry-degrees',
            {
              batchId: fromEntry.batchId,
              fromMinDegreeName: fromEntry.minDegreeName,
              fromHighDegreeName: fromEntry.highDegreeName,
              toMinDegreeName: toMin,
              toHighDegreeName: toHigh || null,
            },
            'Updated min/high on',
          ).then(() => {
            setConfirmEntry(false);
            setFromEntryKey('');
          });
        }}
      >
        This updates course row fields only. The published catalog is not
        changed.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmProgramme}
        title="Rename this programme?"
        busy={busy}
        onCancel={() => setConfirmProgramme(false)}
        onConfirm={() => {
          if (!programmeName) return;
          void run(
            '/data-entry/unpublished/programmes/rename',
            { fromName: programmeName, newName: newProgramme.trim() },
            'Renamed programme on',
          ).then(() => {
            setConfirmProgramme(false);
            setProgrammeName(null);
          });
        }}
      >
        This renames programmeName on unpublished course rows only.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmSch}
        title="Update scholarship?"
        busy={busy}
        onCancel={() => setConfirmSch(false)}
        onConfirm={() => {
          if (!fromSch) return;
          void run(
            '/data-entry/unpublished/scholarships/remap',
            {
              batchId: fromSch.batchId,
              degreeName: fromSch.degreeName,
              fromName: fromSch.name,
              fromAmount: fromSch.amount,
              fromAmountType: fromSch.amountType,
              toName: toSchName.trim(),
              toAmount: toSchAmount.trim(),
              toAmountType: toSchType,
            },
            'Updated scholarships on',
          ).then(() => {
            setConfirmSch(false);
            setFromSchKey('');
          });
        }}
      >
        This updates scholarship fields on matching course rows only.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDeadline}
        title="Set deadline and application fee?"
        busy={busy}
        onCancel={() => setConfirmDeadline(false)}
        onConfirm={() => {
          if (!selectedIntake || !intakeUni) return;
          void run(
            '/data-entry/unpublished/intakes/deadline',
            {
              batchId: intakeUni.batchId,
              year: selectedIntake.year,
              month: selectedIntake.month,
              applicationDeadline: deadlineDate.trim(),
              applicationFee: deadlineFee.trim(),
            },
            'Updated deadline on',
          ).then(() => setConfirmDeadline(false));
        }}
      >
        This updates application deadline and fee on unpublished course rows only.
        A blank field is cleared.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmSchMeta}
        title="Fix scholarship metadata?"
        busy={busy}
        onCancel={() => setConfirmSchMeta(false)}
        onConfirm={() => {
          if (!schMetaPreview) return;
          void run(
            '/data-entry/unpublished/scholarships/metadata-fix',
            {
              clearMetadata: schMetaPreview.clearGroups.map((group) => group.metadata),
              fills: schMetaPreview.missingGroups.map((group) => ({
                name: group.name,
                amount: group.amount,
                metadata: schMetaFills[`${group.name}\0${group.amount}`] ?? '',
              })),
            },
            'Updated scholarship metadata on',
          ).then(() => {
            setConfirmSchMeta(false);
            setSchMetaOpen(false);
          });
        }}
      >
        Clears metadata where the amount is 0 or there is no scholarship, and
        writes the metadata you entered where the amount is greater than 0.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmIntake}
        title="Move this intake?"
        busy={busy}
        onCancel={() => setConfirmIntake(false)}
        onConfirm={() => {
          if (!selectedIntake || !intakeUni) return;
          void run(
            '/data-entry/unpublished/intakes/remap',
            {
              batchId: intakeUni.batchId,
              fromYear: selectedIntake.year,
              fromMonth: selectedIntake.month,
              toYear,
              toMonth,
            },
            'Moved intake on',
          ).then(() => {
            setConfirmIntake(false);
            setFromIntake('');
          });
        }}
      >
        This rewrites intakeInfo on unpublished course rows only.
      </ConfirmDialog>
    </AdminShell>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
