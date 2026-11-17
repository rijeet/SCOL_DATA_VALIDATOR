import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgePercent,
  BookOpen,
  Building2,
  CalendarRange,
  Globe,
  GraduationCap,
  Languages,
  RefreshCw,
} from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';

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
  levelOrder?: number;
  courseCount?: number;
  courseCountByCountryId?: Record<string, number>;
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

type SnapshotPayload = {
  updatedAt: string;
  totals: { countries: number; universities: number; courses: number };
  byCountry: CountrySlice[];
  degrees: DegreeItem[];
  englishTests: EnglishTestItem[];
  scholarships?: ScholarshipItem[];
  intakesByUni?: UniIntakes[];
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
        return { ...d, shownCount: count, levelOrder: d.levelOrder ?? 0 };
      })
      .filter((d) => !selectedCountryId || d.shownCount > 0)
      .sort((a, b) => a.levelOrder - b.levelOrder || a.name.localeCompare(b.name));
  }, [payload, selectedCountryId]);

  const scholarships = useMemo(() => {
    const rows = payload?.scholarships ?? [];
    return selectedCountryId
      ? rows.filter((s) => s.countryId === selectedCountryId)
      : rows;
  }, [payload, selectedCountryId]);

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
        `Moved ${result.updated} intakes, merged ${result.merged}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Intake update failed');
    } finally {
      setRemapping(false);
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
                  Degree names
                </h2>
                <ul className="max-h-64 overflow-y-auto text-sm">
                  {degrees.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 border-b border-slate-50 py-1.5 font-bold"
                    >
                      <span className="text-slate-800">{d.name}</span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        Lvl {d.levelOrder} · {d.shownCount} courses
                      </span>
                    </li>
                  ))}
                  {degrees.length === 0 && (
                    <li className="font-bold text-slate-500">None</li>
                  )}
                </ul>
              </div>
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
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                <BadgePercent className="h-4 w-4" aria-hidden />
                Scholarships
              </h2>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">University</th>
                      <th className="py-2 pr-3">Degree</th>
                      <th className="py-2 pr-3">Amount</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2">Courses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scholarships.map((s) => (
                      <tr
                        key={`${s.uniId}-${s.degreeId}-${s.amount}-${s.amountType}`}
                        className="border-t border-slate-100 font-bold"
                      >
                        <td className="py-2 pr-3 text-slate-800">{s.uniName}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          {s.degreeName}
                        </td>
                        <td className="py-2 pr-3 text-slate-800">
                          {formatAmount(s.amount, null)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {s.amountType?.trim() || '—'}
                        </td>
                        <td className="py-2 text-slate-500">{s.courseCount}</td>
                      </tr>
                    ))}
                    {scholarships.length === 0 && (
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
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
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
          This rebuilds country, university, course, degree, English-test,
          scholarship, and intake counts from the catalog. It does not change
          published data.
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
            ? `Change ${intakeLabel(fromIntake.year, fromIntake.month)} to ${intakeLabel(toYear, toMonth)} for every matching course at ${selectedIntakeUni.uniName}. Courses that already have the new date keep it; the old intake is removed.`
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
