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
  Banknote,
  Languages,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
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

type ScholarshipMetaCourse = {
  courseName: string;
  uniName: string;
  batchId: string;
  rowIndex: number;
  rowCount: number;
  universityKey: string;
};

type ScholarshipMetaPreview = {
  clearGroups: { metadata: string; courseCount: number; courses: ScholarshipMetaCourse[] }[];
  missingGroups: {
    name: string;
    amount: string;
    courseCount: number;
    courses: ScholarshipMetaCourse[];
  }[];
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
  score?: string | null;
  applicationDeadline?: string | null;
  applicationFee?: string | null;
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

type EnglishScoreGroup = {
  overall: string;
  section: string;
  courseCount: number;
};

type UniTuition = {
  uniId: string;
  uniName: string;
  countryId: string;
  groups: {
    currency: string;
    amount: string;
    year: number;
    month: number;
    courseCount: number;
  }[];
};

type UniEnglishTests = {
  uniId: string;
  uniName: string;
  countryId: string;
  tests: { id: string; name: string; groups: EnglishScoreGroup[] }[];
};

type SnapshotPayload = {
  updatedAt: string;
  totals: { countries: number; universities: number; courses: number };
  byCountry: CountrySlice[];
  degrees: DegreeItem[];
  englishTests: EnglishTestItem[];
  englishByUni?: UniEnglishTests[];
  tuitionByUni?: UniTuition[];
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
  const [intakeCourses, setIntakeCourses] = useState<DegreeCourseItem[] | null>(
    null,
  );
  const [intakeCoursesLoading, setIntakeCoursesLoading] = useState(false);
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
  const [englishUniId, setEnglishUniId] = useState('');
  const [englishTestId, setEnglishTestId] = useState('');
  const [englishGroupKey, setEnglishGroupKey] = useState('');
  const [toEngOverall, setToEngOverall] = useState('');
  const [toEngSection, setToEngSection] = useState('');
  const [confirmEnglish, setConfirmEnglish] = useState(false);
  const [savingEnglish, setSavingEnglish] = useState(false);
  const [toeflPreview, setToeflPreview] = useState<ToeflPreview | null>(null);
  const [toeflOpen, setToeflOpen] = useState(false);
  const [toeflEdits, setToeflEdits] = useState<Record<string, string>>({});
  const [toeflBusy, setToeflBusy] = useState(false);
  const [deadlineUniId, setDeadlineUniId] = useState('');
  const [deadlineKey, setDeadlineKey] = useState('');
  const [deadlineCourses, setDeadlineCourses] = useState<DegreeCourseItem[] | null>(null);
  const [deadlineCoursesLoading, setDeadlineCoursesLoading] = useState(false);
  const [deadlineListTick, setDeadlineListTick] = useState(0);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineFee, setDeadlineFee] = useState('');
  const [confirmDeadline, setConfirmDeadline] = useState(false);
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [schMetaPreview, setSchMetaPreview] = useState<ScholarshipMetaPreview | null>(
    null,
  );
  const [schMetaOpen, setSchMetaOpen] = useState(false);
  const [schMetaFills, setSchMetaFills] = useState<Record<string, string>>({});
  const [schMetaBusy, setSchMetaBusy] = useState(false);
  const [confirmSchMeta, setConfirmSchMeta] = useState(false);
  const [tuitionUniId, setTuitionUniId] = useState('');
  const [tuitionKey, setTuitionKey] = useState('');
  const [toFeeCurrency, setToFeeCurrency] = useState('');
  const [toFeeAmount, setToFeeAmount] = useState('');
  const [confirmTuition, setConfirmTuition] = useState(false);
  const [savingTuition, setSavingTuition] = useState(false);
  const [tuitionCourses, setTuitionCourses] = useState<DegreeCourseItem[] | null>(
    null,
  );
  const [tuitionCoursesLoading, setTuitionCoursesLoading] = useState(false);
  const [englishCourses, setEnglishCourses] = useState<DegreeCourseItem[] | null>(
    null,
  );
  const [englishCoursesLoading, setEnglishCoursesLoading] = useState(false);
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [programmeCourses, setProgrammeCourses] = useState<
    DegreeCourseItem[] | null
  >(null);
  const [programmeCoursesLoading, setProgrammeCoursesLoading] = useState(false);
  const [scholarshipCourses, setScholarshipCourses] = useState<
    DegreeCourseItem[] | null
  >(null);
  const [scholarshipCoursesLoading, setScholarshipCoursesLoading] =
    useState(false);
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
    window.open(
      `/work/${course.batchId}/rows/${course.rowIndex}`,
      '_blank',
      'noopener',
    );
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

  const selectedDeadlineUni =
    intakeUnis.find((u) => u.uniId === deadlineUniId) ?? intakeUnis[0] ?? null;

  useEffect(() => {
    if (!selectedDeadlineUni) {
      setDeadlineUniId('');
      setDeadlineKey('');
      return;
    }
    if (deadlineUniId !== selectedDeadlineUni.uniId) {
      setDeadlineUniId(selectedDeadlineUni.uniId);
      setDeadlineKey('');
    }
  }, [selectedDeadlineUni, deadlineUniId]);

  const selectedDeadline = selectedDeadlineUni?.intakes.find(
    (i) => String(i.intakeKey) === deadlineKey,
  );

  useEffect(() => {
    if (!selectedDeadlineUni || !selectedDeadline) {
      setDeadlineCourses(null);
      return;
    }
    let cancelled = false;
    setDeadlineCoursesLoading(true);
    const params = new URLSearchParams({
      uniId: selectedDeadlineUni.uniId,
      year: String(selectedDeadline.year),
      month: String(selectedDeadline.month),
    });
    apiFetch<{ courses: DegreeCourseItem[] }>(
      `/data-entry/dashboard/intakes/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setDeadlineCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setDeadlineCourses([]);
          setError(e instanceof Error ? e.message : 'Failed to load deadline courses');
        }
      })
      .finally(() => {
        if (!cancelled) setDeadlineCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedDeadlineUni?.uniId,
    selectedDeadline?.year,
    selectedDeadline?.month,
    deadlineListTick,
  ]);

  const fromIntake = selectedIntakeUni?.intakes.find(
    (i) => String(i.intakeKey) === fromKey,
  );

  useEffect(() => {
    if (!selectedIntakeUni || !fromIntake) {
      setIntakeCourses(null);
      return;
    }
    let cancelled = false;
    setIntakeCoursesLoading(true);
    const params = new URLSearchParams({
      uniId: selectedIntakeUni.uniId,
      year: String(fromIntake.year),
      month: String(fromIntake.month),
    });
    apiFetch<{ courses: DegreeCourseItem[] }>(
      `/data-entry/dashboard/intakes/courses?${params}`,
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
  }, [selectedIntakeUni, fromIntake]);

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
    if (!programmeId) {
      setProgrammeCourses(null);
      return;
    }
    let cancelled = false;
    setProgrammeCoursesLoading(true);
    apiFetch<{ courses: DegreeCourseItem[] }>(
      `/data-entry/dashboard/programmes/${programmeId}/courses`,
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
  }, [programmeId]);

  const englishUnis = useMemo(() => {
    const rows = payload?.englishByUni ?? [];
    return selectedCountryId
      ? rows.filter((u) => u.countryId === selectedCountryId)
      : rows;
  }, [payload, selectedCountryId]);
  const selectedEnglishUni =
    englishUnis.find((u) => u.uniId === englishUniId) ?? englishUnis[0] ?? null;
  const selectedEnglishTest =
    selectedEnglishUni?.tests.find((t) => t.id === englishTestId) ??
    selectedEnglishUni?.tests[0] ??
    null;
  const selectedEnglishGroup =
    selectedEnglishTest?.groups.find(
      (g) => `${g.overall}\0${g.section}` === englishGroupKey,
    ) ?? null;

  useEffect(() => {
    if (!selectedEnglishUni) {
      setEnglishUniId('');
      setEnglishTestId('');
      setEnglishGroupKey('');
      return;
    }
    if (englishUniId !== selectedEnglishUni.uniId) {
      setEnglishUniId(selectedEnglishUni.uniId);
      setEnglishTestId('');
      setEnglishGroupKey('');
    }
  }, [selectedEnglishUni, englishUniId]);

  useEffect(() => {
    if (!selectedEnglishUni || !selectedEnglishTest || !selectedEnglishGroup) {
      setEnglishCourses(null);
      return;
    }
    let cancelled = false;
    setEnglishCoursesLoading(true);
    const params = new URLSearchParams({
      uniId: selectedEnglishUni.uniId,
      overall: selectedEnglishGroup.overall,
      section: selectedEnglishGroup.section,
    });
    apiFetch<{ courses: DegreeCourseItem[] }>(
      `/data-entry/dashboard/english-tests/${selectedEnglishTest.id}/courses?${params}`,
    )
      .then((data) => {
        if (!cancelled) setEnglishCourses(data.courses);
      })
      .catch((e) => {
        if (!cancelled) {
          setEnglishCourses([]);
          setError(
            e instanceof Error ? e.message : 'Failed to load English test courses',
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
    apiFetch<ToeflPreview>('/data-entry/dashboard/english-tests/toefl-preview')
      .then((data) => {
        if (cancelled) return;
        setToeflPreview(data);
        setToeflEdits(
          Object.fromEntries(
            data.items.map((item) => [
              `${item.kind}\0${item.score}`,
              item.suggested ?? '',
            ]),
          ),
        );
        if (!data.hasOldScore) setToeflOpen(false);
      })
      .catch(() => {
        if (!cancelled) setToeflPreview({ hasOldScore: false, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    apiFetch<ScholarshipMetaPreview>(
      '/data-entry/dashboard/scholarships/metadata-preview',
    )
      .then((data) => {
        if (cancelled) return;
        setSchMetaPreview(data);
        if (data.clearGroups.length === 0 && data.missingGroups.length === 0) {
          setSchMetaOpen(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSchMetaPreview({ clearGroups: [], missingGroups: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const tuitionUnis = useMemo(() => {
    const rows = payload?.tuitionByUni ?? [];
    return selectedCountryId
      ? rows.filter((u) => u.countryId === selectedCountryId)
      : rows;
  }, [payload, selectedCountryId]);
  const selectedTuitionUni =
    tuitionUnis.find((u) => u.uniId === tuitionUniId) ?? tuitionUnis[0] ?? null;
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
      uniId: selectedTuitionUni.uniId,
      currency: selectedTuition.currency,
      amount: selectedTuition.amount,
      year: String(selectedTuition.year),
      month: String(selectedTuition.month),
    });
    apiFetch<{ courses: DegreeCourseItem[] }>(
      `/data-entry/dashboard/tuition/courses?${params}`,
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

  async function remapTuition() {
    if (!selectedTuitionUni || !selectedTuition) return;
    setSavingTuition(true);
    setError(null);
    try {
      await apiFetch('/data-entry/dashboard/tuition/remap', {
        method: 'POST',
        body: JSON.stringify({
          uniId: selectedTuitionUni.uniId,
          fromCurrency: selectedTuition.currency,
          fromAmount: selectedTuition.amount,
          year: selectedTuition.year,
          month: selectedTuition.month,
          toCurrency: toFeeCurrency,
          toAmount: toFeeAmount,
        }),
      });
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmTuition(false);
      setTuitionKey('');
      setRemapNotice('Updated tuition on the catalog and course rows.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tuition update failed');
    } finally {
      setSavingTuition(false);
    }
  }

  async function remapEnglish() {
    if (!selectedEnglishUni || !selectedEnglishTest || !selectedEnglishGroup) {
      return;
    }
    setSavingEnglish(true);
    setError(null);
    try {
      await apiFetch('/data-entry/dashboard/english-tests/remap', {
        method: 'POST',
        body: JSON.stringify({
          uniId: selectedEnglishUni.uniId,
          testId: selectedEnglishTest.id,
          fromOverall: selectedEnglishGroup.overall,
          fromSection: selectedEnglishGroup.section,
          toOverall: toEngOverall,
          toSection: toEngSection,
        }),
      });
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmEnglish(false);
      setEnglishGroupKey('');
      setRemapNotice('Updated English scores on the catalog and course rows.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'English score update failed');
    } finally {
      setSavingEnglish(false);
    }
  }

  useEffect(() => {
    if (!fromScholarship || !selectedScholarshipUni) {
      setScholarshipCourses(null);
      return;
    }
    let cancelled = false;
    setScholarshipCoursesLoading(true);
    const params = new URLSearchParams({
      uniId: selectedScholarshipUni.uniId,
      degreeId: fromScholarship.degreeId,
      name: fromScholarship.name ?? '',
      amount: fromScholarship.amount ?? '',
      amountType: fromScholarship.amountType ?? '',
    });
    apiFetch<{ courses: DegreeCourseItem[] }>(
      `/data-entry/dashboard/scholarships/courses?${params}`,
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
  }, [fromScholarship, selectedScholarshipUni]);

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

  async function saveDeadline() {
    if (!selectedDeadlineUni || !selectedDeadline) return;
    setSavingDeadline(true);
    setError(null);
    setRemapNotice(null);
    try {
      const result = await apiFetch<RemapResult>(
        '/data-entry/dashboard/intakes/deadline',
        {
          method: 'POST',
          body: JSON.stringify({
            uniId: selectedDeadlineUni.uniId,
            year: selectedDeadline.year,
            month: selectedDeadline.month,
            applicationDeadline: deadlineDate.trim(),
            applicationFee: deadlineFee.trim(),
          }),
        },
      );
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmDeadline(false);
      setDeadlineListTick((tick) => tick + 1);
      setRemapNotice(
        `Updated deadline and application fee on ${result.updated} rows at ${selectedDeadlineUni.uniName}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deadline update failed');
    } finally {
      setSavingDeadline(false);
    }
  }

  async function applyScholarshipMeta() {
    if (!schMetaPreview) return;
    setSchMetaBusy(true);
    setError(null);
    setRemapNotice(null);
    try {
      const result = await apiFetch<RemapResult>(
        '/data-entry/dashboard/scholarships/metadata-fix',
        {
          method: 'POST',
          body: JSON.stringify({
            clearMetadata: schMetaPreview.clearGroups.map((group) => group.metadata),
            fills: schMetaPreview.missingGroups.map((group) => ({
              name: group.name,
              amount: group.amount,
              metadata: schMetaFills[`${group.name}\0${group.amount}`] ?? '',
            })),
          }),
        },
      );
      const res = await apiFetch<SnapshotResponse>(
        '/data-entry/dashboard/refresh',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPayload(res.payload);
      setConfirmSchMeta(false);
      setSchMetaOpen(false);
      setRemapNotice(`Updated scholarship metadata on ${result.updated} rows.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scholarship metadata update failed');
    } finally {
      setSchMetaBusy(false);
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

            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                  <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
                    <button
                      type="button"
                      onClick={() => setFromEntryKey('')}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                      aria-label="Close min/high editor"
                    >
                      <X className="h-5 w-5" strokeWidth={2.5} />
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
            </section>

            <section className="mb-6">
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
                  <ul className="mt-3 max-h-48 overflow-y-auto text-sm">
                    {programmeCoursesLoading && (
                      <li className="font-bold text-slate-500">Loading courses…</li>
                    )}
                    {(programmeCourses ?? []).map((c) => {
                      const editable = c.batchId != null && c.rowIndex != null;
                      return (
                        <li key={`${c.uniId}:${c.courseName}:${c.rowIndex}`}>
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
                            <span className="min-w-0 truncate">
                              {c.courseName}
                              <span className="block truncate text-xs text-slate-500">
                                {c.uniName}
                              </span>
                            </span>
                            {editable ? (
                              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                            ) : (
                              <span className="shrink-0 text-xs">No row</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                    {!programmeCoursesLoading &&
                      (programmeCourses ?? []).length === 0 && (
                        <li className="font-bold text-slate-500">No courses</li>
                      )}
                  </ul>
                )}
                {selectedProgramme && (
                  <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
                    <button
                      type="button"
                      onClick={() => {
                        setProgrammeId(null);
                        setProgrammeName('');
                      }}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                      aria-label="Close programme editor"
                    >
                      <X className="h-5 w-5" strokeWidth={2.5} />
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
                        schMetaPreview.clearGroups.reduce(
                          (sum, group) => sum + group.courseCount,
                          0,
                        ) +
                        schMetaPreview.missingGroups.reduce(
                          (sum, group) => sum + group.courseCount,
                          0,
                        )
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
                    <div key={group.metadata} className="mb-3">
                      <p className="text-sm font-medium text-slate-700">
                        Clear metadata on {group.courseCount} courses with amount 0
                        or no scholarship.
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{group.metadata}</p>
                      <ul className="mt-1 max-h-40 overflow-y-auto">
                        {(group.courses ?? []).map((course) => (
                          <li key={`${course.batchId}:${course.rowIndex}`}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 py-1 text-left text-sm font-bold text-slate-800 hover:text-emerald-800"
                              onClick={() =>
                                openCourseRow({
                                  uniId: '',
                                  uniName: course.uniName,
                                  courseName: course.courseName,
                                  programmeName: null,
                                  universityKey: course.universityKey,
                                  batchId: course.batchId,
                                  rowIndex: course.rowIndex,
                                  rowCount: course.rowCount,
                                })
                              }
                            >
                              <span className="min-w-0 truncate">
                                {course.courseName}
                                <span className="block truncate text-xs font-medium text-slate-500">
                                  {course.uniName}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {schMetaPreview?.missingGroups.map((group) => {
                    const key = `${group.name}\0${group.amount}`;
                    return (
                      <div key={key} className="mb-3">
                      <label
                        className="mb-2 block text-sm font-bold text-slate-700"
                      >
                        {group.name || 'Scholarship'} · {group.amount} ·{' '}
                        {group.courseCount}
                        <textarea
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium"
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
                      <ul className="mt-1 max-h-40 overflow-y-auto">
                        {(group.courses ?? []).map((course) => (
                          <li key={`${course.batchId}:${course.rowIndex}`}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 py-1 text-left text-sm font-bold text-slate-800 hover:text-emerald-800"
                              onClick={() =>
                                openCourseRow({
                                  uniId: '',
                                  uniName: course.uniName,
                                  courseName: course.courseName,
                                  programmeName: null,
                                  universityKey: course.universityKey,
                                  batchId: course.batchId,
                                  rowIndex: course.rowIndex,
                                  rowCount: course.rowCount,
                                })
                              }
                            >
                              <span className="min-w-0 truncate">
                                {course.courseName}
                                <span className="block truncate text-xs font-medium text-slate-500">
                                  {course.uniName}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    disabled={
                      schMetaBusy ||
                      !schMetaPreview ||
                      (schMetaPreview.clearGroups.length === 0 &&
                        schMetaPreview.missingGroups.length === 0) ||
                      schMetaPreview.missingGroups.some(
                        (group) =>
                          !(schMetaFills[`${group.name}\0${group.amount}`] ?? '').trim(),
                      )
                    }
                    onClick={() => {
                      setError(null);
                      setConfirmSchMeta(true);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Apply metadata
                  </button>
                </div>
              )}
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
                <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_5rem_6.5rem_7rem_4.5rem] bg-white py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <span>Scholarship</span>
                  <span>Degree</span>
                  <span className="text-right">Amount</span>
                  <span className="pl-3">Type</span>
                  <span className="text-right">Courses</span>
                </div>
                {scholarshipRows.map((s) => {
                  const key = scholarshipRowKey(s);
                  const active = key === fromScholarshipKey;
                  const typeLabel = s.name
                    ? AMOUNT_TYPES.find(
                        (t) =>
                          t.typeCode ===
                          normalizeCommissionType(s.amountType ?? ''),
                      )?.typeName ??
                      s.amountType?.trim() ??
                      '—'
                    : '—';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setFromScholarshipKey(key);
                        setToSchName(s.name ?? '');
                        setToSchAmount(s.amount ?? '');
                        setToSchType(
                          normalizeCommissionType(s.amountType ?? '') ?? '',
                        );
                      }}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_5rem_6.5rem_7rem_4.5rem] items-center border-t border-slate-100 py-2 text-left text-sm font-bold ${
                        active ? 'text-emerald-800' : 'text-slate-800'
                      }`}
                    >
                      <span className="min-w-0 truncate pr-3">
                        {s.name?.trim() || 'No scholarship'}
                      </span>
                      <span className="text-slate-700">{s.degreeName}</span>
                      <span className="text-right text-slate-800">
                        {s.name ? formatAmount(s.amount, null) : '—'}
                      </span>
                      <span className="pl-3 text-slate-700">{typeLabel}</span>
                      <span className="text-right text-slate-500">
                        {s.courseCount}
                      </span>
                    </button>
                  );
                })}
                {scholarshipRows.length === 0 && (
                  <p className="py-3 text-sm font-bold text-slate-500">None</p>
                )}
              </div>
              {fromScholarship && selectedScholarshipUni && (
                <ul className="mt-3 max-h-48 overflow-y-auto text-sm">
                  {scholarshipCoursesLoading && (
                    <li className="font-bold text-slate-500">Loading courses…</li>
                  )}
                  {(scholarshipCourses ?? []).map((c) => {
                    const editable = c.batchId != null && c.rowIndex != null;
                    return (
                      <li key={`${c.courseName}:${c.rowIndex}`}>
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
                          <span className="min-w-0 truncate">{c.courseName}</span>
                          {editable ? (
                            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                          ) : (
                            <span className="shrink-0 text-xs">No row</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {!scholarshipCoursesLoading &&
                    (scholarshipCourses ?? []).length === 0 && (
                      <li className="font-bold text-slate-500">No courses</li>
                    )}
                </ul>
              )}
              {fromScholarship && selectedScholarshipUni && (
                <div className="relative mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
                  <button
                    type="button"
                    onClick={() => setFromScholarshipKey('')}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                    aria-label="Close scholarship editor"
                  >
                    <X className="h-5 w-5" strokeWidth={2.5} />
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
                          selected && past
                            ? 'border-red-700 bg-red-700 text-white'
                            : selected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : past
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-200 bg-slate-50 text-slate-800'
                        }`}
                      >
                        {intakeLabel(i.year, i.month)} · {i.courseCount}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-500">
                  No intake dates in catalog.
                </p>
              )}

              {fromIntake && (
                <ul className="mt-3 max-h-64 overflow-y-auto text-sm">
                  {intakeCoursesLoading && (
                    <li className="font-bold text-slate-500">Loading courses…</li>
                  )}
                  {(intakeCourses ?? []).map((c) => {
                    const editable = c.batchId != null && c.rowIndex != null;
                    return (
                      <li key={`${c.uniId}:${c.courseName}:${c.rowIndex}`}>
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
                            <span className="block truncate">{c.courseName}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {c.uniName}
                              {c.programmeName ? ` · ${c.programmeName}` : ''}
                            </span>
                          </span>
                          {editable ? (
                            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                          ) : (
                            <span className="shrink-0 text-xs">No row</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {!intakeCoursesLoading && (intakeCourses ?? []).length === 0 && (
                    <li className="font-bold text-slate-500">No courses</li>
                  )}
                </ul>
              )}

              {fromIntake && selectedIntakeUni && (
                <div className="relative mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 pr-12">
                  <button
                    type="button"
                    onClick={() => setFromKey('')}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                    aria-label="Close intake editor"
                  >
                    <X className="h-5 w-5" strokeWidth={2.5} />
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

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                <CalendarRange className="h-4 w-4" aria-hidden />
                Deadline and application fee
              </h2>
              <p className="mb-3 text-sm font-medium text-slate-600">
                Pick a university and intake, then set the deadline and fee for every course in that intake. Leave a box blank to clear that value.
              </p>
              <label className="mb-3 block text-sm font-bold text-slate-700">
                University
                <select
                  className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                  value={selectedDeadlineUni?.uniId ?? ''}
                  onChange={(e) => {
                    setDeadlineUniId(e.target.value);
                    setDeadlineKey('');
                  }}
                >
                  {intakeUnis.length === 0 && <option value="">No intakes</option>}
                  {intakeUnis.map((u) => (
                    <option key={u.uniId} value={u.uniId}>
                      {u.uniName}
                    </option>
                  ))}
                </select>
              </label>
              {selectedDeadlineUni ? (
                <div className="flex flex-wrap gap-2">
                  {selectedDeadlineUni.intakes.map((i) => {
                    const selected = String(i.intakeKey) === deadlineKey;
                    return (
                      <button
                        key={i.intakeKey}
                        type="button"
                        onClick={() => setDeadlineKey(String(i.intakeKey))}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                          selected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-800'
                        }`}
                      >
                        {intakeLabel(i.year, i.month)} · {i.courseCount}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-500">No intake dates in catalog.</p>
              )}
              {selectedDeadline && selectedDeadlineUni && (
                <ul className="mt-3 max-h-64 overflow-y-auto text-sm">
                  {deadlineCoursesLoading && (
                    <li className="font-bold text-slate-500">Loading courses…</li>
                  )}
                  {(deadlineCourses ?? []).map((course) => {
                    const editable = course.batchId != null && course.rowIndex != null;
                    return (
                      <li key={`${course.courseName}:${course.rowIndex}`}>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => openCourseRow(course)}
                          className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-left ${
                            editable
                              ? 'text-slate-800 hover:text-emerald-800'
                              : 'cursor-default text-slate-800'
                          }`}
                        >
                          <span className="min-w-0 truncate font-bold">{course.courseName}</span>
                          <span className="shrink-0 text-xs font-bold text-slate-600">
                            {course.applicationDeadline || 'No deadline'}
                            {' · '}
                            {course.applicationFee || 'No fee'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {!deadlineCoursesLoading && (deadlineCourses ?? []).length === 0 && (
                    <li className="font-bold text-slate-500">No courses</li>
                  )}
                </ul>
              )}
              {selectedDeadline && selectedDeadlineUni && (
                <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="text-sm font-bold text-slate-700">
                    Application deadline
                    <input
                      placeholder="MM/DD/YYYY"
                      className="mt-1 block w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    Application fee
                    <input
                      placeholder="5500"
                      className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium"
                      value={deadlineFee}
                      onChange={(e) => setDeadlineFee(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      (!deadlineDate.trim() && !deadlineFee.trim()) ||
                      (deadlineDate.trim() !== '' &&
                        !/^\d{2}\/\d{2}\/\d{4}$/.test(deadlineDate.trim())) ||
                      (deadlineFee.trim() !== '' &&
                        !/^\d+(\.\d+)?$/.test(deadlineFee.trim()))
                    }
                    onClick={() => {
                      setError(null);
                      setConfirmDeadline(true);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Update courses
                  </button>
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
                          item.kind === 'overall'
                            ? 'bg-amber-100'
                            : 'bg-green-100';
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
                        (item) =>
                          !(toeflEdits[`${item.kind}\0${item.score}`] ?? '').trim(),
                      );
                      if (missing) {
                        setError('Enter a 1–6 score for every TOEFL row.');
                        return;
                      }
                      setToeflBusy(true);
                      setError(null);
                      void apiFetch(
                        '/data-entry/dashboard/english-tests/toefl-scale',
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
                        .then(async () => {
                          const res = await apiFetch<SnapshotResponse>(
                            '/data-entry/dashboard/refresh',
                            { method: 'POST', body: JSON.stringify({}) },
                          );
                          setPayload(res.payload);
                          setToeflOpen(false);
                          setRemapNotice('Updated TOEFL scores to the 1–6 scale.');
                        })
                        .catch((e) => {
                          setError(
                            e instanceof Error ? e.message : 'TOEFL update failed',
                          );
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
                  value={selectedEnglishUni?.uniId ?? ''}
                  onChange={(e) => {
                    setEnglishUniId(e.target.value);
                    setEnglishTestId('');
                    setEnglishGroupKey('');
                  }}
                >
                  {englishUnis.map((u) => (
                    <option key={u.uniId} value={u.uniId}>
                      {u.uniName}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEnglishUni ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedEnglishUni.tests.map((t) => {
                    const active = selectedEnglishTest?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setEnglishTestId(t.id);
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
                  No English scores in catalog.
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
                  {(englishCourses ?? []).map((c) => {
                    const editable = c.batchId != null && c.rowIndex != null;
                    return (
                      <li key={`${c.uniId}:${c.courseName}:${c.rowIndex}`}>
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
                          <span className="min-w-0 truncate">
                            {c.courseName}
                            <span className="block truncate text-xs text-slate-500">
                              {c.uniName}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-bold">
                            {c.score || '—'}
                            {!editable && (
                              <span className="ml-2 font-bold">No row</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
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
                      className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                      value={toEngOverall}
                      onChange={(e) => setToEngOverall(e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    Section min
                    <input
                      className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                      value={toEngSection}
                      onChange={(e) => setToEngSection(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      toEngOverall.trim() === selectedEnglishGroup.overall &&
                      toEngSection.trim() === selectedEnglishGroup.section
                    }
                    onClick={() => {
                      setError(null);
                      setConfirmEnglish(true);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
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
                  value={selectedTuitionUni?.uniId ?? ''}
                  onChange={(e) => {
                    setTuitionUniId(e.target.value);
                    setTuitionKey('');
                  }}
                >
                  {tuitionUnis.map((u) => (
                    <option key={u.uniId} value={u.uniId}>
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
                        {g.currency} {g.amount} · {intakeLabel(g.year, g.month)} ·{' '}
                        {g.courseCount}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm font-bold text-slate-500">
                  No tuition fees in catalog.
                </p>
              )}
              {selectedTuition && (
                <ul className="mt-3 max-h-64 overflow-y-auto text-sm">
                  {tuitionCoursesLoading && (
                    <li className="font-bold text-slate-500">Loading courses…</li>
                  )}
                  {(tuitionCourses ?? []).map((c) => {
                    const editable = c.batchId != null && c.rowIndex != null;
                    return (
                      <li key={`${c.uniId}:${c.courseName}:${c.rowIndex}`}>
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
                          <span className="min-w-0 truncate">
                            {c.courseName}
                            <span className="block truncate text-xs text-slate-500">
                              {c.uniName}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-bold">
                            {c.score || '—'}
                            {!editable && (
                              <span className="ml-2 font-bold">No row</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
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
                      className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                      value={toFeeCurrency}
                      onChange={(e) => setToFeeCurrency(e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    Amount
                    <input
                      className="mt-1 block w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                      value={toFeeAmount}
                      onChange={(e) => setToFeeAmount(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      toFeeCurrency.trim().toUpperCase() === selectedTuition.currency &&
                      toFeeAmount.trim() === selectedTuition.amount
                    }
                    onClick={() => {
                      setError(null);
                      setConfirmTuition(true);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Set tuition
                  </button>
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
          open={confirmTuition}
          title="Change this tuition fee?"
          confirmLabel="Set tuition"
          busyLabel="Updating…"
          tone="primary"
          busy={savingTuition}
          error={error}
          onCancel={() => {
            if (!savingTuition) setConfirmTuition(false);
          }}
          onConfirm={() => void remapTuition()}
        >
          {selectedTuition && selectedTuitionUni
            ? `Change ${selectedTuition.currency} ${selectedTuition.amount} for ${intakeLabel(selectedTuition.year, selectedTuition.month)} to ${toFeeCurrency} ${toFeeAmount} at ${selectedTuitionUni.uniName}. Updates the published catalog and the course row editor.`
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmEnglish}
          title="Change this English score?"
          confirmLabel="Set score"
          busyLabel="Updating…"
          tone="primary"
          busy={savingEnglish}
          error={error}
          onCancel={() => {
            if (!savingEnglish) setConfirmEnglish(false);
          }}
          onConfirm={() => void remapEnglish()}
        >
          {selectedEnglishGroup && selectedEnglishUni && selectedEnglishTest
            ? `Change ${selectedEnglishTest.name} ${selectedEnglishGroup.overall}/${selectedEnglishGroup.section} to ${toEngOverall}/${toEngSection} for every matching course at ${selectedEnglishUni.uniName}. Updates the published catalog and the course row editor.`
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmDeadline}
          title="Set deadline and application fee?"
          confirmLabel="Set deadline"
          busyLabel="Updating…"
          tone="primary"
          busy={savingDeadline}
          error={error}
          onCancel={() => {
            if (!savingDeadline) setConfirmDeadline(false);
          }}
          onConfirm={() => void saveDeadline()}
        >
          {selectedDeadline && selectedDeadlineUni
            ? `Update ${intakeLabel(selectedDeadline.year, selectedDeadline.month)} at ${selectedDeadlineUni.uniName}. Deadline ${deadlineDate.trim() || 'cleared'}, application fee ${deadlineFee.trim() || 'cleared'}.`
            : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmSchMeta}
          title="Fix scholarship metadata?"
          confirmLabel="Apply metadata"
          busyLabel="Updating…"
          tone="primary"
          busy={schMetaBusy}
          error={error}
          onCancel={() => {
            if (!schMetaBusy) setConfirmSchMeta(false);
          }}
          onConfirm={() => void applyScholarshipMeta()}
        >
          Clears metadata where the amount is 0 or there is no scholarship, and
          writes the metadata you entered where the amount is greater than 0.
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
