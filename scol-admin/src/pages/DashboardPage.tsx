import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgePercent,
  BookMarked,
  BookOpen,
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Globe,
  GraduationCap,
  Languages,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';
import {
  AMOUNT_TYPES,
  normalizeCommissionType,
} from '../lib/amountTypes';
import { setWorkSession } from '../lib/workSession';

type GeoItem = { id: string; name: string };

type CountrySlice = {
  id: string;
  name: string;
  code: string | null;
  universityCount: number;
  courseCount: number;
  universities: Array<{ id: string; name: string; courseCount: number }>;
};

type DegreeItem = {
  id: string;
  name: string;
  levelOrder?: number | null;
  courseCount?: number;
  courseCountByCountryId?: Record<string, number>;
};

type DegreeCourseItem = {
  uniId: string;
  uniName: string;
  courseName: string;
  programmeName: string | null;
  universityKey: string;
  batchId: string | null;
  rowIndex: number | null;
  rowCount: number | null;
};

type DegreeCourseList = {
  degreeId: string;
  degreeName: string;
  courses: DegreeCourseItem[];
};

type EnglishTestItem = {
  id: string;
  name: string;
  minScore?: number | null;
  maxScore?: number | null;
};

type ScholarshipItem = {
  uniId: string;
  uniName: string;
  countryId: string;
  degreeId: string;
  degreeName: string;
  name?: string | null;
  amount: string | null;
  amountType: string | null;
  courseCount: number;
};

type IntakeChip = {
  year: number;
  month: number;
  intakeKey: number;
  courseCount: number;
};

type UniIntakes = {
  uniId: string;
  uniName: string;
  countryId: string;
  intakes: IntakeChip[];
};

type ProgrammeItem = {
  id: string;
  name: string;
  courseCount?: number;
  courseCountByUniId?: Record<string, number>;
};

type EntryDegreeGroup = {
  uniId: string;
  uniName: string;
  countryId: string;
  minDegreeId: string;
  minDegreeName: string;
  minGpa?: string | null;
  highDegreeId?: string | null;
  highDegreeName?: string | null;
  highGpa?: string | null;
  courseCount: number;
};

type SnapshotPayload = {
  updatedAt: string;
  totals: { countries: number; universities: number; courses: number };
  byCountry: CountrySlice[];
  degrees: DegreeItem[];
  englishTests: EnglishTestItem[];
  scholarships?: ScholarshipItem[];
  intakesByUni?: UniIntakes[];
  programmes?: ProgrammeItem[];
  entryDegreesByUni?: EntryDegreeGroup[];
  geo: {
    countries: GeoItem[];
    statesByCountryId: Record<string, GeoItem[]>;
    citiesByStateId: Record<string, GeoItem[]>;
  };
};

type SnapshotResponse = { payload: SnapshotPayload | null };

type RemapResult = { updated: number; merged: number; skipped: number };

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
] as const;

function intakeLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

function currentIntakeKey(now = new Date()): number {
  return now.getFullYear() * 12 + (now.getMonth() + 1);
}

function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function entryPairKey(row: {
  minDegreeId: string;
  highDegreeId?: string | null;
}): string {
  return `${row.minDegreeId}::${row.highDegreeId ?? ''}`;
}

function scholarshipRowKey(s: {
  uniId: string;
  degreeId: string;
  name?: string | null;
  amount?: string | null;
  amountType?: string | null;
}): string {
  return [
    s.uniId,
    s.degreeId,
    s.name ?? '',
    s.amount ?? '',
    s.amountType ?? '',
  ].join('::');
}

function scholarshipOptionKey(
  name: string | null | undefined,
  amount: string | null | undefined,
  amountType: string | null | undefined,
): string {
  const n = Number(amount);
  const amt =
    amount == null || amount === ''
      ? ''
      : Number.isFinite(n)
        ? String(n)
        : String(amount);
  return `${(name ?? '').trim().toLowerCase()}|${amt}|${normalizeCommissionType(amountType ?? '') ?? ''}`;
}

function formatAmount(amount: string | null, amountType: string | null): string {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  const pretty = Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : amount;
  const type = (amountType ?? '').trim();
  if (!type) return pretty;
  if (/%|percent/i.test(type)) return `${pretty}%`;
  return `${pretty} ${type}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDegree, setSelectedDegree] = useState<DegreeItem | null>(null);
  const [degreeCourses, setDegreeCourses] = useState<DegreeCourseItem[] | null>(
    null,
  );
  const [degreeCoursesLoading, setDegreeCoursesLoading] = useState(false);
  const [degreeCoursesError, setDegreeCoursesError] = useState<string | null>(
    null,
  );
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(
    null,
  );
  const [intakeUniId, setIntakeUniId] = useState('');
  const [fromKey, setFromKey] = useState('');
  const [toMonth, setToMonth] = useState(1);
  const [toYear, setToYear] = useState(new Date().getFullYear());
  const [confirmRemap, setConfirmRemap] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [remapNotice, setRemapNotice] = useState<string | null>(null);
  const [entryUniId, setEntryUniId] = useState('');
  const [fromEntryKey, setFromEntryKey] = useState('');
  const [toMinDegreeId, setToMinDegreeId] = useState('');
  const [toHighDegreeId, setToHighDegreeId] = useState('');
  const [confirmEntry, setConfirmEntry] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [programmeName, setProgrammeName] = useState('');
  const [confirmProgramme, setConfirmProgramme] = useState(false);
  const [savingProgramme, setSavingProgramme] = useState(false);
  const [scholarshipUniId, setScholarshipUniId] = useState('');
  const [fromScholarshipKey, setFromScholarshipKey] = useState('');
  const [toSchName, setToSchName] = useState('');
  const [toSchAmount, setToSchAmount] = useState('');
  const [toSchType, setToSchType] = useState('');
  const [confirmScholarship, setConfirmScholarship] = useState(false);
  const [savingScholarship, setSavingScholarship] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SnapshotResponse>('/data-entry/dashboard')
      .then((res) => {
        if (cancelled) return;
        setPayload(res.payload);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshSnapshot() {
    setUpdating(true);
    setError(null);
    try {
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmUpdate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  const catalogCountries = useMemo(
    () =>
      (payload?.byCountry ?? []).filter(
        (c) => c.universityCount > 0 || c.courseCount > 0,
      ),
    [payload],
  );
  const selectedCountry = catalogCountries.find(
    (c) => c.id === selectedCountryId,
  );
  const nowKey = currentIntakeKey();

  const degrees = useMemo(() => {
    const rows = payload?.degrees ?? [];
    return rows
      .map((d) => {
        const count = selectedCountryId
          ? (d.courseCountByCountryId?.[selectedCountryId] ?? 0)
          : (d.courseCount ?? 0);
        return { ...d, shownCount: count, levelOrder: d.levelOrder ?? null };
      })
      .filter((d) => !selectedCountryId || d.shownCount > 0)
      .sort((a, b) => {
        if (a.levelOrder == null && b.levelOrder == null) {
          return a.name.localeCompare(b.name);
        }
        if (a.levelOrder == null) return 1;
        if (b.levelOrder == null) return -1;
        return a.levelOrder - b.levelOrder || a.name.localeCompare(b.name);
      });
  }, [payload, selectedCountryId]);

  useEffect(() => {
    if (!selectedDegree) {
      setDegreeCourses(null);
      setDegreeCoursesError(null);
      setDegreeCoursesLoading(false);
      return;
    }
    let cancelled = false;
    setDegreeCoursesLoading(true);
    setDegreeCoursesError(null);
    const q = selectedCountryId
      ? `?countryId=${encodeURIComponent(selectedCountryId)}`
      : '';
    apiFetch<DegreeCourseList>(
      `/data-entry/dashboard/degrees/${selectedDegree.id}/courses${q}`,
    )
      .then((res) => {
        if (cancelled) return;
        setDegreeCourses(res.courses);
        setDegreeCoursesLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setDegreeCourses(null);
        setDegreeCoursesError(
          e instanceof Error ? e.message : 'Failed to load courses',
        );
        setDegreeCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDegree, selectedCountryId]);

  function openDegreeCourses(degree: DegreeItem) {
    setSelectedDegree(degree);
    setDegreeCourses(null);
    setDegreeCoursesError(null);
    setDegreeCoursesLoading(true);
  }

  function closeDegreeCourses() {
    setSelectedDegree(null);
    setDegreeCourses(null);
    setDegreeCoursesError(null);
    setDegreeCoursesLoading(false);
  }

  function openCourseRow(course: DegreeCourseItem) {
    if (course.batchId == null || course.rowIndex == null) return;
    setWorkSession({
      batchId: course.batchId,
      rowIndex: course.rowIndex,
      universityKey: course.universityKey,
      rowCount: course.rowCount ?? course.rowIndex + 1,
    });
    navigate(`/work/${course.batchId}/rows/${course.rowIndex}`);
  }

  const entryDegrees = useMemo(
    () =>
      (payload?.degrees ?? [])
        .filter((d) => d.levelOrder != null)
        .slice()
        .sort(
          (a, b) =>
            (a.levelOrder ?? 0) - (b.levelOrder ?? 0) ||
            a.name.localeCompare(b.name),
        ),
    [payload],
  );

  const scholarships = useMemo(() => {
    const rows = payload?.scholarships ?? [];
    return selectedCountryId
      ? rows.filter((s) => s.countryId === selectedCountryId)
      : rows;
  }, [payload, selectedCountryId]);

  const scholarshipUnis = useMemo(() => {
    const byId = new Map<string, { uniId: string; uniName: string }>();
    for (const s of scholarships) {
      if (!byId.has(s.uniId)) {
        byId.set(s.uniId, { uniId: s.uniId, uniName: s.uniName });
      }
    }
    return [...byId.values()].sort((a, b) => a.uniName.localeCompare(b.uniName));
  }, [scholarships]);

  const selectedScholarshipUni =
    scholarshipUnis.find((u) => u.uniId === scholarshipUniId) ??
    scholarshipUnis[0] ??
    null;

  const scholarshipRows = useMemo(() => {
    if (!selectedScholarshipUni) return [];
    return scholarships.filter((s) => s.uniId === selectedScholarshipUni.uniId);
  }, [scholarships, selectedScholarshipUni]);

  const fromScholarship = scholarshipRows.find(
    (s) => scholarshipRowKey(s) === fromScholarshipKey,
  );

  const scholarshipOptions = useMemo(() => {
    const byKey = new Map<
      string,
      { name: string; amount: string | null; amountType: string | null }
    >();
    for (const s of scholarshipRows) {
      if (!s.name) continue;
      const key = scholarshipOptionKey(s.name, s.amount, s.amountType);
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: s.name,
          amount: s.amount,
          amountType: s.amountType,
        });
      }
    }
    return [...byKey.entries()].map(([key, opt]) => ({ key, ...opt }));
  }, [scholarshipRows]);

  useEffect(() => {
    if (!selectedScholarshipUni) {
      setScholarshipUniId('');
      setFromScholarshipKey('');
      return;
    }
    if (scholarshipUniId !== selectedScholarshipUni.uniId) {
      setScholarshipUniId(selectedScholarshipUni.uniId);
      setFromScholarshipKey('');
    }
  }, [selectedScholarshipUni, scholarshipUniId]);

  const intakeUnis = useMemo(() => {
    const rows = payload?.intakesByUni ?? [];
    return selectedCountryId
      ? rows.filter((u) => u.countryId === selectedCountryId)
      : rows;
  }, [payload, selectedCountryId]);

  const selectedIntakeUni =
    intakeUnis.find((u) => u.uniId === intakeUniId) ?? intakeUnis[0] ?? null;

  useEffect(() => {
    if (!selectedIntakeUni) {
      setIntakeUniId('');
      setFromKey('');
      return;
    }
    if (intakeUniId !== selectedIntakeUni.uniId) {
      setIntakeUniId(selectedIntakeUni.uniId);
      setFromKey('');
    }
  }, [selectedIntakeUni, intakeUniId]);

  const fromIntake = selectedIntakeUni?.intakes.find(
    (i) => String(i.intakeKey) === fromKey,
  );

  const programmes = useMemo(() => {
    const uniIds = selectedCountry
      ? new Set(selectedCountry.universities.map((u) => u.id))
      : null;
    return (payload?.programmes ?? [])
      .map((p) => {
        const count = uniIds
          ? [...uniIds].reduce(
              (sum, id) => sum + (p.courseCountByUniId?.[id] ?? 0),
              0,
            )
          : (p.courseCount ?? 0);
        return { ...p, shownCount: count };
      })
      .filter((p) => !uniIds || p.shownCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payload, selectedCountry]);

  const entryUnis = useMemo(() => {
    const rows = payload?.entryDegreesByUni ?? [];
    const filtered = selectedCountryId
      ? rows.filter((r) => r.countryId === selectedCountryId)
      : rows;
    const byUni = new Map<string, { uniId: string; uniName: string }>();
    for (const r of filtered) {
      byUni.set(r.uniId, { uniId: r.uniId, uniName: r.uniName });
    }
    return [...byUni.values()].sort((a, b) =>
      a.uniName.localeCompare(b.uniName),
    );
  }, [payload, selectedCountryId]);

  const selectedEntryUni =
    entryUnis.find((u) => u.uniId === entryUniId) ?? entryUnis[0] ?? null;

  const entryRows = useMemo(() => {
    const rows = payload?.entryDegreesByUni ?? [];
    if (!selectedEntryUni) return [];
    return rows.filter((r) => r.uniId === selectedEntryUni.uniId);
  }, [payload, selectedEntryUni]);

  const fromEntry = entryRows.find((r) => entryPairKey(r) === fromEntryKey);

  const selectedProgramme = programmes.find((p) => p.id === programmeId);

  useEffect(() => {
    if (!selectedEntryUni) {
      setEntryUniId('');
      setFromEntryKey('');
      return;
    }
    if (entryUniId !== selectedEntryUni.uniId) {
      setEntryUniId(selectedEntryUni.uniId);
      setFromEntryKey('');
    }
  }, [selectedEntryUni, entryUniId]);

  async function remapIntakes() {
    if (!selectedIntakeUni || !fromIntake) return;
    setRemapping(true);
    setError(null);
    setRemapNotice(null);
    try {
      const result = await apiFetch<RemapResult>(
        '/data-entry/dashboard/intakes/remap',
        {
          method: 'POST',
          body: JSON.stringify({
            uniId: selectedIntakeUni.uniId,
            fromYear: fromIntake.year,
            fromMonth: fromIntake.month,
            toYear,
            toMonth,
          }),
        },
      );
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmRemap(false);
      setFromKey('');
      setRemapNotice(
        `Moved ${result.updated} intakes, merged ${result.merged}, skipped ${result.skipped} staging rows.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Intake update failed');
    } finally {
      setRemapping(false);
    }
  }

  async function remapEntryDegrees() {
    if (!selectedEntryUni || !fromEntry || !toMinDegreeId) return;
    setSavingEntry(true);
    setError(null);
    setRemapNotice(null);
    try {
      const result = await apiFetch<RemapResult>(
        '/data-entry/dashboard/courses/entry-degrees',
        {
          method: 'POST',
          body: JSON.stringify({
            uniId: selectedEntryUni.uniId,
            fromMinDegreeId: fromEntry.minDegreeId,
            fromHighDegreeId: fromEntry.highDegreeId || null,
            toMinDegreeId,
            toHighDegreeId: toHighDegreeId || null,
          }),
        },
      );
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmEntry(false);
      setFromEntryKey('');
      setRemapNotice(
        `Updated min/high on ${result.updated} courses, skipped ${result.skipped} staging rows.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Entry degree update failed');
    } finally {
      setSavingEntry(false);
    }
  }

  async function renameProgramme() {
    if (!selectedProgramme || !programmeName.trim()) return;
    setSavingProgramme(true);
    setError(null);
    setRemapNotice(null);
    try {
      const result = await apiFetch<RemapResult>(
        '/data-entry/dashboard/programmes/rename',
        {
          method: 'POST',
          body: JSON.stringify({
            programmeId: selectedProgramme.id,
            newName: programmeName.trim(),
          }),
        },
      );
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmProgramme(false);
      setProgrammeId(null);
      setProgrammeName('');
      setRemapNotice(
        `Renamed programme on ${result.updated} courses${result.merged ? ' (merged duplicate name)' : ''}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Programme rename failed');
    } finally {
      setSavingProgramme(false);
    }
  }

  async function remapScholarships() {
    if (!selectedScholarshipUni || !fromScholarship || !toSchName.trim()) {
      return;
    }
    setSavingScholarship(true);
    setError(null);
    setRemapNotice(null);
    try {
      const result = await apiFetch<RemapResult>(
        '/data-entry/dashboard/scholarships/remap',
        {
          method: 'POST',
          body: JSON.stringify({
            uniId: selectedScholarshipUni.uniId,
            degreeId: fromScholarship.degreeId,
            fromName: fromScholarship.name ?? null,
            fromAmount: fromScholarship.amount,
            fromAmountType: fromScholarship.amountType,
            toName: toSchName.trim(),
            toAmount: toSchAmount.trim(),
            toAmountType: toSchType,
          }),
        },
      );
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmScholarship(false);
      setFromScholarshipKey('');
      setRemapNotice(
        `Updated ${result.updated} scholarships, skipped ${result.skipped} staging rows.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scholarship update failed');
    } finally {
      setSavingScholarship(false);
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <LoadingSplash
          title="Loading dashboard"
          subtitle="Reading last snapshot…"
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {payload?.updatedAt
                ? `Last update ${new Date(payload.updatedAt).toLocaleString()}`
                : 'No snapshot yet. Update loads counts from the database.'}
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

        {error && (
          <p className="mb-4 text-sm font-bold text-red-600">{error}</p>
        )}
        {remapNotice && (
          <p className="mb-4 text-sm font-bold text-emerald-700">
            {remapNotice}
          </p>
        )}

        {!payload ? (
          <p className="font-bold text-slate-600">
            The dashboard is empty until you confirm Update.
          </p>
        ) : (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-3">
              <Kpi
                icon={<Globe className="h-5 w-5" aria-hidden />}
                label="Countries"
                value={catalogCountries.length}
              />
              <Kpi
                icon={<Building2 className="h-5 w-5" aria-hidden />}
                label="Universities"
                value={payload.totals.universities}
              />
              <Kpi
                icon={<BookOpen className="h-5 w-5" aria-hidden />}
                label="Courses"
                value={payload.totals.courses}
              />
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                <Globe className="h-4 w-4" aria-hidden />
                Country
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {catalogCountries.map((c) => {
                  const active = selectedCountryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelectedCountryId((id) =>
                          id === c.id ? null : c.id,
                        )
                      }
                      className={`rounded-xl border px-3 py-3 text-left transition ${
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
              {catalogCountries.length === 0 && (
                <p className="mt-2 text-sm font-bold text-slate-500">
                  No published universities yet. Publish a university CSV, then
                  Update.
                </p>
              )}
              {selectedCountry && (
                <ul className="mt-3 max-h-48 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
                  {selectedCountry.universities.map((u) => (
                    <li
                      key={u.id}
                      className="flex justify-between gap-3 py-2 text-sm font-bold"
                    >
                      <span className="text-slate-800">{u.name}</span>
                      <span className="text-slate-500">
                        {u.courseCount} courses
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  <GraduationCap className="h-4 w-4" aria-hidden />
                  {selectedDegree
                    ? selectedDegree.name
                    : 'Degree names'}
                </h2>
                {selectedDegree ? (
                  <>
                    <button
                      type="button"
                      onClick={closeDegreeCourses}
                      className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      All degrees
                    </button>
                    {degreeCoursesLoading && (
                      <p className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden
                        />
                        Loading courses
                      </p>
                    )}
                    {degreeCoursesError && (
                      <p className="text-sm font-bold text-rose-700">
                        {degreeCoursesError}
                      </p>
                    )}
                    {!degreeCoursesLoading && !degreeCoursesError && (
                      <ul className="max-h-64 overflow-y-auto text-sm">
                        {(degreeCourses ?? []).map((c) => {
                          const editable =
                            c.batchId != null && c.rowIndex != null;
                          return (
                            <li key={`${c.uniId}:${c.courseName}`}>
                              <button
                                type="button"
                                disabled={!editable}
                                onClick={() => openCourseRow(c)}
                                className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold ${
                                  editable
                                    ? 'text-slate-800 hover:text-emerald-800'
                                    : 'cursor-not-allowed text-slate-400'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate">
                                    {c.courseName}
                                  </span>
                                  <span className="block truncate text-xs text-slate-500">
                                    {c.uniName}
                                    {c.programmeName
                                      ? ` · ${c.programmeName}`
                                      : ''}
                                  </span>
                                </span>
                                {editable ? (
                                  <ChevronRight
                                    className="h-4 w-4 shrink-0 text-slate-400"
                                    aria-hidden
                                  />
                                ) : (
                                  <span className="shrink-0 text-xs">
                                    No row
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                        {(degreeCourses ?? []).length === 0 && (
                          <li className="font-bold text-slate-500">
                            No courses
                          </li>
                        )}
                      </ul>
                    )}
                  </>
                ) : (
                  <ul className="max-h-64 overflow-y-auto text-sm">
                    {degrees.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => openDegreeCourses(d)}
                          className="flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold text-slate-800 hover:text-emerald-800"
                        >
                          <span>{d.name}</span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500">
                            {d.levelOrder != null
                              ? `Lvl ${d.levelOrder} · ${d.shownCount} courses`
                              : `${d.shownCount} courses`}
                            <ChevronRight
                              className="h-3.5 w-3.5"
                              aria-hidden
                            />
                          </span>
                        </button>
                      </li>
                    ))}
                    {degrees.length === 0 && (
                      <li className="font-bold text-slate-500">None</li>
                    )}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  <GraduationCap className="h-4 w-4" aria-hidden />
                  Min / high degree
                </h2>
                <label className="mb-3 block text-sm font-bold text-slate-700">
                  University
                  <select
                    className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                    value={selectedEntryUni?.uniId ?? ''}
                    onChange={(e) => {
                      setEntryUniId(e.target.value);
                      setFromEntryKey('');
                    }}
                  >
                    {entryUnis.length === 0 && (
                      <option value="">No entry degrees</option>
                    )}
                    {entryUnis.map((u) => (
                      <option key={u.uniId} value={u.uniId}>
                        {u.uniName}
                      </option>
                    ))}
                  </select>
                </label>
                <ul className="max-h-48 overflow-y-auto text-sm">
                  {entryRows.map((r) => {
                    const key = entryPairKey(r);
                    const active = key === fromEntryKey;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => {
                            setFromEntryKey(key);
                            setToMinDegreeId(r.minDegreeId);
                            setToHighDegreeId(r.highDegreeId ?? '');
                          }}
                          className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold ${
                            active ? 'text-emerald-800' : 'text-slate-800'
                          }`}
                        >
                          <span>
                            Min {r.minDegreeName}
                            {r.highDegreeName
                              ? ` · High ${r.highDegreeName}`
                              : ' · High —'}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
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
                {fromEntry && selectedEntryUni && (
                  <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-9">
                    <button
                      type="button"
                      onClick={() => setFromEntryKey('')}
                      className="absolute right-2 top-2 rounded p-0.5 text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                      aria-label="Close min/high editor"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <p className="text-xs font-medium text-slate-600">
                      Change this min/high pair for matching courses at{' '}
                      {selectedEntryUni.uniName}. Awarded degree names are not
                      changed.
                    </p>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="text-sm font-bold text-slate-700">
                        New min
                        <select
                          className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                          value={toMinDegreeId}
                          onChange={(e) => setToMinDegreeId(e.target.value)}
                        >
                          {entryDegrees.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-bold text-slate-700">
                        New high
                        <select
                          className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                          value={toHighDegreeId}
                          onChange={(e) => setToHighDegreeId(e.target.value)}
                        >
                          <option value="">None</option>
                          {entryDegrees.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={
                          toMinDegreeId === fromEntry.minDegreeId &&
                          (toHighDegreeId || '') ===
                            (fromEntry.highDegreeId ?? '')
                        }
                        onClick={() => {
                          setError(null);
                          setConfirmEntry(true);
                        }}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                      >
                        Set min/high
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  <Languages className="h-4 w-4" aria-hidden />
                  English tests
                </h2>
                <ul className="max-h-64 overflow-y-auto text-sm">
                  {(payload.englishTests ?? []).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 border-b border-slate-50 py-1.5 font-bold"
                    >
                      <span className="text-slate-800">{t.name}</span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        Min {formatScore(t.minScore)} · Max{' '}
                        {formatScore(t.maxScore)}
                      </span>
                    </li>
                  ))}
                  {(payload.englishTests ?? []).length === 0 && (
                    <li className="font-bold text-slate-500">None</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  <BookMarked className="h-4 w-4" aria-hidden />
                  Programme
                </h2>
                <ul className="max-h-48 overflow-y-auto text-sm">
                  {programmes.map((p) => {
                    const active = programmeId === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setProgrammeId(p.id);
                            setProgrammeName(p.name);
                          }}
                          className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 py-1.5 text-left font-bold ${
                            active ? 'text-emerald-800' : 'text-slate-800'
                          }`}
                        >
                          <span>{p.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {p.shownCount} courses
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {programmes.length === 0 && (
                    <li className="font-bold text-slate-500">None</li>
                  )}
                </ul>
                {selectedProgramme && (
                  <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-9">
                    <button
                      type="button"
                      onClick={() => {
                        setProgrammeId(null);
                        setProgrammeName('');
                      }}
                      className="absolute right-2 top-2 rounded p-0.5 text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                      aria-label="Close programme editor"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <label className="text-sm font-bold text-slate-700">
                      New name
                      <input
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                        value={programmeName}
                        onChange={(e) => setProgrammeName(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        !programmeName.trim() ||
                        programmeName.trim().toLowerCase() ===
                          selectedProgramme.name.trim().toLowerCase()
                      }
                      onClick={() => {
                        setError(null);
                        setConfirmProgramme(true);
                      }}
                      className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Rename programme
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                <BadgePercent className="h-4 w-4" aria-hidden />
                Scholarships
              </h2>
              <label className="mb-3 block text-sm font-bold text-slate-700">
                University
                <select
                  className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                  value={selectedScholarshipUni?.uniId ?? ''}
                  onChange={(e) => {
                    setScholarshipUniId(e.target.value);
                    setFromScholarshipKey('');
                  }}
                >
                  {scholarshipUnis.length === 0 && (
                    <option value="">No scholarships</option>
                  )}
                  {scholarshipUnis.map((u) => (
                    <option key={u.uniId} value={u.uniId}>
                      {u.uniName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Scholarship</th>
                      <th className="py-2 pr-3">Degree</th>
                      <th className="py-2 pr-3">Amount</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2">Courses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scholarshipRows.map((s) => {
                      const key = scholarshipRowKey(s);
                      const active = key === fromScholarshipKey;
                      return (
                        <tr key={key} className="border-t border-slate-100">
                          <td colSpan={5} className="p-0">
                            <button
                              type="button"
                              onClick={() => {
                                setFromScholarshipKey(key);
                                setToSchName(s.name ?? '');
                                setToSchAmount(s.amount ?? '');
                                setToSchType(
                                  normalizeCommissionType(s.amountType ?? '') ??
                                    '',
                                );
                              }}
                              className={`flex w-full items-center gap-3 py-2 pr-3 text-left font-bold ${
                                active ? 'text-emerald-800' : 'text-slate-800'
                              }`}
                            >
                              <span className="min-w-0 flex-1 pr-3">
                                {s.name?.trim() || 'No scholarship'}
                              </span>
                              <span className="w-24 shrink-0 text-slate-700">
                                {s.degreeName}
                              </span>
                              <span className="w-24 shrink-0 text-slate-800">
                                {s.name
                                  ? formatAmount(s.amount, null)
                                  : '—'}
                              </span>
                              <span className="w-28 shrink-0 text-slate-700">
                                {s.name
                                  ? AMOUNT_TYPES.find(
                                      (t) =>
                                        t.typeCode ===
                                        normalizeCommissionType(
                                          s.amountType ?? '',
                                        ),
                                    )?.typeName ??
                                    s.amountType?.trim() ??
                                    '—'
                                  : '—'}
                              </span>
                              <span className="w-16 shrink-0 text-slate-500">
                                {s.courseCount}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {scholarshipRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-3 font-bold text-slate-500"
                        >
                          None
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {fromScholarship && selectedScholarshipUni && (
                <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-9">
                  <button
                    type="button"
                    onClick={() => setFromScholarshipKey('')}
                    className="absolute right-2 top-2 rounded p-0.5 text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                    aria-label="Close scholarship editor"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <p className="text-xs font-medium text-slate-600">
                    {fromScholarship.name
                      ? `Change this scholarship for matching ${fromScholarship.degreeName} courses at ${selectedScholarshipUni.uniName}.`
                      : `Assign a scholarship to ${fromScholarship.courseCount} ${fromScholarship.degreeName} courses with no scholarship at ${selectedScholarshipUni.uniName}.`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-sm font-bold text-slate-700">
                      Scholarship
                      <select
                        className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                        value={
                          toSchName
                            ? scholarshipOptionKey(
                                toSchName,
                                toSchAmount,
                                toSchType,
                              )
                            : ''
                        }
                        onChange={(e) => {
                          const opt = scholarshipOptions.find(
                            (o) => o.key === e.target.value,
                          );
                          if (!opt) {
                            setToSchName('');
                            return;
                          }
                          setToSchName(opt.name);
                          setToSchAmount(opt.amount ?? '');
                          setToSchType(
                            normalizeCommissionType(opt.amountType ?? '') ??
                              '',
                          );
                        }}
                      >
                        <option value="">
                          {fromScholarship.name
                            ? 'Keep / choose scholarship'
                            : 'Select scholarship'}
                        </option>
                        {scholarshipOptions.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.name} · {formatAmount(o.amount, null)}{' '}
                            {AMOUNT_TYPES.find(
                              (t) =>
                                t.typeCode ===
                                normalizeCommissionType(o.amountType ?? ''),
                            )?.typeName ??
                              o.amountType ??
                              ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      Amount
                      <input
                        className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                        value={toSchAmount}
                        onChange={(e) => setToSchAmount(e.target.value)}
                      />
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      Type
                      <select
                        className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                        value={toSchType}
                        onChange={(e) => setToSchType(e.target.value)}
                      >
                        <option value="">Select type</option>
                        {AMOUNT_TYPES.map((t) => (
                          <option key={t.typeCode} value={t.typeCode}>
                            {t.typeName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        !toSchName.trim() ||
                        !toSchAmount.trim() ||
                        !toSchType ||
                        (scholarshipOptionKey(
                          fromScholarship.name,
                          fromScholarship.amount,
                          fromScholarship.amountType,
                        ) ===
                          scholarshipOptionKey(
                            toSchName,
                            toSchAmount,
                            toSchType,
                          ))
                      }
                      onClick={() => {
                        setError(null);
                        setConfirmScholarship(true);
                      }}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      {fromScholarship.name
                        ? 'Set scholarship'
                        : 'Assign scholarship'}
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
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="text-sm font-bold text-slate-700">
                  University
                  <select
                    className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                    value={selectedIntakeUni?.uniId ?? ''}
                    onChange={(e) => {
                      setIntakeUniId(e.target.value);
                      setFromKey('');
                    }}
                  >
                    {intakeUnis.length === 0 && (
                      <option value="">No intakes</option>
                    )}
                    {intakeUnis.map((u) => (
                      <option key={u.uniId} value={u.uniId}>
                        {u.uniName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedIntakeUni ? (
                <div className="flex flex-wrap gap-2">
                  {selectedIntakeUni.intakes.map((i) => {
                    const past = i.intakeKey < nowKey;
                    const selected = String(i.intakeKey) === fromKey;
                    return (
                      <button
                        key={i.intakeKey}
                        type="button"
                        onClick={() => {
                          setFromKey(String(i.intakeKey));
                          setToMonth(i.month);
                          setToYear(i.year);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                          selected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : past
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : 'border-slate-200 bg-slate-50 text-slate-800'
                        }`}
                      >
                        {intakeLabel(i.year, i.month)} · {i.courseCount}
                        {past ? ' · past' : ''}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-500">
                  No intake dates in catalog.
                </p>
              )}

              {fromIntake && selectedIntakeUni && (
                <div className="relative mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-9">
                  <button
                    type="button"
                    onClick={() => setFromKey('')}
                    className="absolute right-2 top-2 rounded p-0.5 text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                    aria-label="Close intake editor"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-bold text-slate-800">
                    Batch update past intakes
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    Move {intakeLabel(fromIntake.year, fromIntake.month)} at{' '}
                    {selectedIntakeUni.uniName} to a new month/year.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-sm font-bold text-slate-700">
                      New month
                      <select
                        className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                        value={toMonth}
                        onChange={(e) => setToMonth(Number(e.target.value))}
                      >
                        {MONTHS.map((label, i) => (
                          <option key={label} value={i + 1}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      New year
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                        value={toYear}
                        onChange={(e) => setToYear(Number(e.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        toYear === fromIntake.year &&
                        toMonth === fromIntake.month
                      }
                      onClick={() => {
                        setError(null);
                        setConfirmRemap(true);
                      }}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Set new intake
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <ConfirmDialog
          open={confirmUpdate}
          title="Update dashboard from the database?"
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
          onConfirm={() => void refreshSnapshot()}
        >
          This rebuilds country, university, course, degree, programme,
          English-test, scholarship, and intake counts from the catalog. It does
          not change published data.
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmRemap}
          title="Move this intake for the university?"
          confirmLabel="Set new intake"
          busyLabel="Updating…"
          tone="primary"
          busy={remapping}
          error={error}
          onCancel={() => {
            if (!remapping) {
              setConfirmRemap(false);
            }
          }}
          onConfirm={() => void remapIntakes()}
        >
          {fromIntake && selectedIntakeUni
            ? `Change ${intakeLabel(fromIntake.year, fromIntake.month)} to ${intakeLabel(toYear, toMonth)} for every matching course at ${selectedIntakeUni.uniName}. Updates the published catalog for this university. Export CSV will match. The original uploaded file is not changed.`
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmEntry}
          title="Change min/high degree for this university?"
          confirmLabel="Set min/high"
          busyLabel="Updating…"
          tone="primary"
          busy={savingEntry}
          error={error}
          onCancel={() => {
            if (!savingEntry) setConfirmEntry(false);
          }}
          onConfirm={() => void remapEntryDegrees()}
        >
          {fromEntry && selectedEntryUni
            ? `Updates the published catalog for ${selectedEntryUni.uniName}. Export CSV will match. The original uploaded file is not changed. Awarded degree names stay the same.`
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmProgramme}
          title="Rename this programme?"
          confirmLabel="Rename programme"
          busyLabel="Updating…"
          tone="primary"
          busy={savingProgramme}
          error={error}
          onCancel={() => {
            if (!savingProgramme) setConfirmProgramme(false);
          }}
          onConfirm={() => void renameProgramme()}
        >
          {selectedProgramme
            ? `Renames this programme for every university that uses it. Export CSV will match. The original uploaded file is not changed.`
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmScholarship}
          title={
            fromScholarship?.name
              ? 'Change this scholarship for the university?'
              : 'Assign this scholarship to courses with none?'
          }
          confirmLabel={
            fromScholarship?.name ? 'Set scholarship' : 'Assign scholarship'
          }
          busyLabel="Updating…"
          tone="primary"
          busy={savingScholarship}
          error={error}
          onCancel={() => {
            if (!savingScholarship) setConfirmScholarship(false);
          }}
          onConfirm={() => void remapScholarships()}
        >
          {fromScholarship && selectedScholarshipUni
            ? `Updates the published catalog for ${fromScholarship.degreeName} courses at ${selectedScholarshipUni.uniName}. RowEditor and Export CSV will match. The original uploaded file is not changed.`
            : null}
        </ConfirmDialog>
      </div>
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
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
