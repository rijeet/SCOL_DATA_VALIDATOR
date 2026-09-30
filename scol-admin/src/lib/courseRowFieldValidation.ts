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

export const COURSE_ROW_RECOMMENDED_FIELDS = [
  'tuitionFee',
  'currency',
  'initialDeposit',
  'applicationFee',
  'commission',
  'applicationDeadline',
  'ieltsMinOverall',
  'ieltsMinSection',
  'toeflMinOverall',
  'toeflMinSection',
  'pteMinOverall',
  'pteMinSection',
  'courseDuration',
  'courseUrlExternal',
] as const;

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
  toeflMinOverall: { max: 120, testLabel: 'TOEFL overall' },
  toeflMinSection: { max: 30, testLabel: 'TOEFL section' },
  pteMinOverall: { max: 90, testLabel: 'PTE overall' },
  pteMinSection: { max: 90, testLabel: 'PTE section' },
};

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
  if (n <= 0) return 'Must be greater than 0';
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

function recommendedMissingErrors(row: CourseRowFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of COURSE_ROW_RECOMMENDED_FIELDS) {
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
  if (higherDeg && higherGpaRaw) {
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
  Object.assign(errors, recommendedMissingErrors(row));

  return errors;
}
