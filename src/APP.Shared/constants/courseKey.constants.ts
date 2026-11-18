/** Working CSV DATA FIX reads from `4_col` and writes to `4_col_filled`. */
export const DATA_FIX_CSV_HEADERS = [
  'courseKey',
  'courseUrlExternal',
  'degreeName',
  'programmeName',
  'tuitionFee',
  'intakeInfo',
] as const;

export type DataFixCsvHeader = (typeof DATA_FIX_CSV_HEADERS)[number];

/** Columns this app copies from a filled CSV onto staging + catalog. */
export const DATA_FIX_PATCH_FIELDS = [
  'tuitionFee',
  'degreeName',
  'programmeName',
  'intakeInfo',
] as const;

export type DataFixPatchField = (typeof DATA_FIX_PATCH_FIELDS)[number];

export type CourseKeyVariant =
  | 'foundation'
  | 'placement'
  | 'topup'
  | 'standard';

const UNI_SLUG_MAX = 40;
const DEGREE_SLUG_MAX = 20;
const COURSE_SLUG_MAX = 80;

export function courseKeySlug(input: string, maxLen = 80): string {
  const s = input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (s || 'x').slice(0, maxLen);
}

export function courseKeyVariant(
  courseName: string,
  courseDuration = '',
): CourseKeyVariant {
  const hay = `${courseName} ${courseDuration}`.toLowerCase();
  if (hay.includes('foundation')) return 'foundation';
  if (
    hay.includes('placement') ||
    hay.includes('sandwich') ||
    /year[\s-]?in[\s-]?industry/.test(hay)
  ) {
    return 'placement';
  }
  if (/top[\s-]?up/.test(hay)) return 'topup';
  return 'standard';
}

export function courseKeyBase(parts: {
  uniName: string;
  degreeName: string;
  courseName: string;
  courseDuration?: string;
}): string {
  const uni = courseKeySlug(parts.uniName, UNI_SLUG_MAX);
  const degree = courseKeySlug(parts.degreeName, DEGREE_SLUG_MAX);
  const course = courseKeySlug(parts.courseName, COURSE_SLUG_MAX);
  const variant = courseKeyVariant(
    parts.courseName,
    parts.courseDuration ?? '',
  );
  return `${uni}__${degree}__${course}__${variant}`;
}

/** Lowercases and records `base`, or `base__2`, `base__3`, … until unique. */
export function allocateCourseKey(base: string, used: Set<string>): string {
  const normalized = (base.trim().toLowerCase() || 'course').slice(0, 170);
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  let n = 2;
  let key = `${normalized}__${n}`;
  while (used.has(key)) {
    n += 1;
    key = `${normalized}__${n}`;
  }
  used.add(key);
  return key;
}

export function dataFixExportFileName(uniName: string): string {
  return `${courseKeySlug(uniName)}_courses.csv`;
}
