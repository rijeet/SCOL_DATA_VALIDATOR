import {
  normalizeScholarshipType,
  scholarshipTypeLabels,
} from './amountTypes';
import {
  canonicalEntryDegreeName,
  entryDegreeLabels,
  gpaScaleForEntryDegree,
} from './degreeSeeds';

/**
 * Mirrors backend @shared/validation/courseRowFieldValidation (keep in sync).
 */

export type CourseRowFields = Record<string, string | undefined>;

const GPA_SCALE_FIVE = new Set(['SSC', 'HSC']);

const GPA_SCALE_FOUR_EXACT = new Set([
  'BSC',
  'BA',
  'BENG',
  'LLB',
  'MSC',
  'MA',
  'MBA',
  'PHD',
]);

/** Fields that must be filled; shown with a red * in the editor and flagged "Missing" when empty. */
export const COURSE_ROW_REQUIRED_FIELDS = [
  'uniName',
  'programmeName',
  'courseName',
  'degreeName',
  'intakeInfo',
  'minDegreeName',
  'minGpa',
  'ieltsMinOverall',
  'ieltsMinSection',
  'toeflMinOverall',
  'toeflMinSection',
  'pteMinOverall',
  'pteMinSection',
  'scholarshipName',
  'scholarshipAmount',
  'scholarshipType',
  'tuitionFee',
  'currency',
  'initialDeposit',
  'courseDuration',
  'courseUrlExternal',
  'AcademicRequirementsMetaData',
  'feesMetaData',
  'scholarshipMetaData',
] as const;

/** @deprecated Kept so existing imports keep working; use COURSE_ROW_REQUIRED_FIELDS. */
export const COURSE_ROW_RECOMMENDED_FIELDS = COURSE_ROW_REQUIRED_FIELDS;

const REQUIRED_FIELD_SET: ReadonlySet<string> = new Set(
  COURSE_ROW_REQUIRED_FIELDS,
);

/** True when the field is flagged "Missing" if empty (shown with a * in the editor). */
export function isCourseRowFieldRequired(fieldKey: string): boolean {
  return REQUIRED_FIELD_SET.has(fieldKey);
}

type EnglishField =
  | 'ieltsMinOverall'
  | 'ieltsMinSection'
  | 'toeflMinOverall'
  | 'toeflMinSection'
  | 'pteMinOverall'
  | 'pteMinSection';

const ENGLISH_SCORE_RULES: Record<
  EnglishField,
  { max: number; testLabel: string }
> = {
  ieltsMinOverall: { max: 9, testLabel: 'IELTS overall' },
  ieltsMinSection: { max: 9, testLabel: 'IELTS minimum band' },
  toeflMinOverall: { max: 6, testLabel: 'TOEFL overall' },
  toeflMinSection: { max: 6, testLabel: 'TOEFL section' },
  pteMinOverall: { max: 90, testLabel: 'PTE overall' },
  pteMinSection: { max: 90, testLabel: 'PTE section' },
};

function plainNumberError(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return null;
  return `"${text}" is not a plain number (no commas, currency symbols or spaces)`;
}

function scholarshipAmountNumber(raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function scholarshipMetaMismatch(row: CourseRowFields): string | null {
  const meta = (row.scholarshipMetaData ?? '').trim();
  const amount = scholarshipAmountNumber(row.scholarshipAmount);
  if (amount != null && amount > 0) {
    if (!meta) return 'Required when scholarship amount is greater than 0';
    return null;
  }
  if (meta) return 'Must be empty when there is no scholarship or the amount is 0';
  return null;
}

function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function normalizeDegreeKey(degreeName: string): string {
  return degreeName.trim().toUpperCase().replace(/\s+/g, '');
}

export function gpaMaxScaleForDegreeLabel(degreeName: string): number {
  const seeded = canonicalEntryDegreeName(degreeName);
  if (seeded) return gpaScaleForEntryDegree(seeded);
  const key = normalizeDegreeKey(degreeName);
  if (!key) return 5;
  if (GPA_SCALE_FIVE.has(key)) return 5;
  if (GPA_SCALE_FOUR_EXACT.has(key)) return 4;
  if (key.includes('SSC') || key.includes('HSC')) return 5;
  if (
    key.startsWith('B') ||
    key.includes('BACHELOR') ||
    key.includes('UNDERGRAD')
  ) {
    return 4;
  }
  if (
    key.startsWith('M') ||
    key.includes('MASTER') ||
    key.includes('POSTGRAD') ||
    key.includes('PHD') ||
    key.includes('DOCTOR')
  ) {
    return 4;
  }
  return 5;
}

function validateGpaValue(raw: string, degreeName: string): string | null {
  const n = parseDecimal(raw);
  if (n === null) return 'Must be a number';
  if (n <= 0) return 'Must be greater than 0';
  const scale = gpaMaxScaleForDegreeLabel(degreeName);
  if (n > scale) {
    const deg = degreeName.trim() || 'degree';
    return `Cannot exceed ${scale} scale for ${deg}`;
  }
  return null;
}

function validateEnglishField(fieldKey: EnglishField, raw: string): string | null {
  const rule = ENGLISH_SCORE_RULES[fieldKey];
  const n = parseDecimal(raw);
  if (n === null) return 'Must be a number when set';
  if (n < 0) return 'Must be 0 or greater';
  if (n > rule.max) {
    return `Max ${rule.max} for ${rule.testLabel}`;
  }
  return null;
}

function englishPairErrors(row: CourseRowFields): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: [string, string][] = [
    ['ieltsMinOverall', 'ieltsMinSection'],
    ['toeflMinOverall', 'toeflMinSection'],
    ['pteMinOverall', 'pteMinSection'],
  ];
  for (const [overallKey, sectionKey] of pairs) {
    const o = (row[overallKey] ?? '').trim();
    const s = (row[sectionKey] ?? '').trim();
    if (o && !s) out[sectionKey] = 'Required when overall is set';
    if (s && !o) out[overallKey] = 'Required when section min is set';
  }
  return out;
}

function requiredMissingErrors(row: CourseRowFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of COURSE_ROW_REQUIRED_FIELDS) {
    if (!(key in row)) continue;
    const v = (row[key] ?? '').trim();
    if (v === '') out[key] = 'Missing';
  }
  return out;
}

export function validateCourseRowScoreAndCompleteness(
  row: CourseRowFields,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const minGpaRaw = (row.minGpa ?? '').trim();
  if (minGpaRaw) {
    const msg = validateGpaValue(minGpaRaw, row.minDegreeName ?? '');
    if (msg) errors.minGpa = msg;
  }

  const higherDeg = (row.higherDegreeName ?? '').trim();
  const higherGpaRaw = (row.higherGpa ?? '').trim();
  if (higherDeg && !higherGpaRaw) {
    errors.higherGpa = 'Required when higher degree is set';
  } else if (!higherDeg && higherGpaRaw) {
    errors.higherDegreeName = 'Required when higher GPA is set';
  } else if (higherDeg && higherGpaRaw) {
    const msg = validateGpaValue(higherGpaRaw, higherDeg);
    if (msg) errors.higherGpa = msg;
  }

  for (const fieldKey of Object.keys(ENGLISH_SCORE_RULES) as EnglishField[]) {
    const x = (row[fieldKey] ?? '').trim();
    if (!x) continue;
    const msg = validateEnglishField(fieldKey, x);
    if (msg) errors[fieldKey] = msg;
  }

  Object.assign(errors, englishPairErrors(row));

  for (const key of ['applicationFee', 'commission'] as const) {
    const raw = (row[key] ?? '').trim();
    if (raw && parseDecimal(raw) === null) errors[key] = 'Must be a number when set';
  }

  for (const key of ['scholarshipAmount', 'tuitionFee'] as const) {
    const raw = (row[key] ?? '').trim();
    const plain = plainNumberError(raw);
    if (plain) errors[key] = plain;
  }

  const deadline = (row.applicationDeadline ?? '').trim();
  if (deadline) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(deadline);
    if (!match) {
      errors.applicationDeadline = 'Must be a date in MM/DD/YYYY format (e.g. 08/31/2026)';
    } else {
      const month = Number(match[1]);
      const day = Number(match[2]);
      const year = Number(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        errors.applicationDeadline = 'Must be a valid date in MM/DD/YYYY format';
      }
    }
  }
  Object.assign(errors, requiredMissingErrors(row));
  const metaError = scholarshipMetaMismatch(row);
  if (metaError) errors.scholarshipMetaData = metaError;
  else if (
    scholarshipAmountNumber(row.scholarshipAmount) == null ||
    scholarshipAmountNumber(row.scholarshipAmount)! <= 0
  ) {
    if (!(row.scholarshipMetaData ?? '').trim()) delete errors.scholarshipMetaData;
  }

  const minDeg = (row.minDegreeName ?? '').trim();
  if (minDeg && !canonicalEntryDegreeName(minDeg)) {
    errors.minDegreeName = `Must be ${entryDegreeLabels()}`;
  }
  const highDeg = (row.higherDegreeName ?? '').trim();
  if (highDeg && !canonicalEntryDegreeName(highDeg)) {
    errors.higherDegreeName = `Must be ${entryDegreeLabels()}`;
  }

  const duration = (row.courseDuration ?? '').trim();
  if (duration && !/^\d+\s*(?:months?)?$/i.test(duration)) {
    errors.courseDuration = 'Must be one number of months, e.g. 24 or 24 months';
  }

  const scholarshipType = (row.scholarshipType ?? '').trim();
  if (scholarshipType && !normalizeScholarshipType(scholarshipType)) {
    errors.scholarshipType = `Must be ${scholarshipTypeLabels()}`;
  }

  return errors;
}
