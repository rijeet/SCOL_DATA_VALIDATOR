import { normalizeCommissionType } from '@shared/constants/amountTypes.constants';

export const UNIVERSITY_ROW_REQUIRED_FIELDS = [
  'uniName',
  'countryName',
  'stateName',
  'cityName',
  'address',
  'commissionType',
  'commission',
  'website',
  'aboutUs',
  'campusLifeLinks',
  'rankingMetaData',
  'locationMapMetaData',
  'establishedYear',
  'universityType',
  'currRanking',
] as const;

const REQUIRED_SET: ReadonlySet<string> = new Set(UNIVERSITY_ROW_REQUIRED_FIELDS);

export function isUniversityRowFieldRequired(fieldKey: string): boolean {
  return REQUIRED_SET.has(fieldKey);
}

/** After catalog publish, only these staging fields stay editable and sync to sys_Universities. */
export const POST_PUBLISH_UNI_EDITABLE_FIELDS = [
  'address',
  'commissionType',
  'commission',
  'website',
  'aboutUs',
  'logoUrl',
  'coverImageUrl',
  'campusLifeLinks',
  'rankingMetaData',
  'locationMapMetaData',
  'establishedYear',
  'universityType',
  'currRanking',
] as const;

const POST_PUBLISH_EDITABLE_SET: ReadonlySet<string> = new Set(
  POST_PUBLISH_UNI_EDITABLE_FIELDS,
);

export function isPostPublishUniEditableField(fieldKey: string): boolean {
  return POST_PUBLISH_EDITABLE_SET.has(fieldKey);
}

const URL_FIELDS = ['logoUrl', 'website', 'coverImageUrl'] as const;
const INT_FIELDS = ['establishedYear', 'currRanking'] as const;

export function isHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw.trim());
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** CSV cell is `"url1", "url2"` (or a single URL). Same rules as scol-crm. */
export function parseCampusLifeLinks(raw: string): {
  urls: string[];
  error?: string;
} {
  const t = raw.trim();
  if (!t) return { urls: [] };
  let list: string[] | null = null;
  try {
    const parsed = JSON.parse(`[${t}]`) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      list = parsed.map((s) => s.trim()).filter(Boolean);
    }
  } catch {
    list = null;
  }
  if (!list) {
    const quoted = [...t.matchAll(/"([^"]+)"/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    if (quoted.length) list = quoted;
  }
  if (!list) {
    list = t
      .split(',')
      .map((s) => s.trim().replace(/^["']+|["']+$/g, ''))
      .filter(Boolean);
  }
  for (const url of list) {
    if (!isHttpUrl(url)) {
      return {
        urls: list,
        error: `"${url}" must start with http:// or https://`,
      };
    }
    if (url.includes(',')) {
      return { urls: list, error: 'URLs must not contain commas' };
    }
  }
  return { urls: list };
}

/** Plain URL, JSON `"https://..."`, or `{"href":"..."}` like scol-crm. */
export function parseLocationMapHref(raw: string): {
  href: string | null;
  error?: string;
} {
  const t = raw.trim();
  if (!t) return { href: null };
  if (t.startsWith('{') || t.startsWith('"')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      const href =
        typeof parsed === 'string'
          ? parsed
          : (parsed as { href?: unknown })?.href;
      if (typeof href !== 'string' || !isHttpUrl(href)) {
        return { href: null, error: 'Must contain a valid "href" URL' };
      }
      return { href };
    } catch {
      return { href: null, error: 'Must be valid JSON' };
    }
  }
  if (!isHttpUrl(t)) return { href: null, error: 'Must be an http(s) URL' };
  return { href: t };
}

function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseIntField(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

export function validateUniversityRowFields(
  row: Record<string, string | undefined>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const key of UNIVERSITY_ROW_REQUIRED_FIELDS) {
    const v = (row[key] ?? '').trim();
    if (!v) errors[key] = 'Missing';
  }

  const commissionTypeRaw = (row.commissionType ?? '').trim();
  if (commissionTypeRaw && !normalizeCommissionType(commissionTypeRaw)) {
    errors.commissionType = 'Must be Amount or Percentage';
  }

  const commission = (row.commission ?? '').trim();
  if (commission) {
    const n = parseDecimal(commission);
    if (n === null) errors.commission = 'Must be a number';
    else if (n < 0) errors.commission = 'Must be 0 or greater';
  }

  for (const key of URL_FIELDS) {
    const v = (row[key] ?? '').trim();
    if (v && !isHttpUrl(v)) {
      errors[key] = 'Must be an http(s) URL';
    }
  }

  const campus = parseCampusLifeLinks(row.campusLifeLinks ?? '');
  if (campus.error) errors.campusLifeLinks = campus.error;
  else if (!campus.urls.length && !errors.campusLifeLinks) {
    errors.campusLifeLinks = 'Missing';
  }

  const map = parseLocationMapHref(row.locationMapMetaData ?? '');
  if (map.error) errors.locationMapMetaData = map.error;

  for (const key of INT_FIELDS) {
    const v = (row[key] ?? '').trim();
    if (!v) continue;
    const n = parseIntField(v);
    if (n === null) {
      errors[key] = 'Must be a whole number';
      continue;
    }
    if (key === 'establishedYear' && (n < 1000 || n > new Date().getFullYear())) {
      errors[key] = `Must be between 1000 and ${new Date().getFullYear()}`;
    }
    if (key === 'currRanking' && n < 1) {
      errors[key] = 'Must be 1 or greater';
    }
  }

  const ranking = (row.rankingMetaData ?? '').trim();
  if (ranking) {
    try {
      const parsed = JSON.parse(ranking) as unknown;
      if (!Array.isArray(parsed)) {
        errors.rankingMetaData = 'Must be a JSON array';
      } else if (parsed.length === 0) {
        errors.rankingMetaData = 'Must be a non-empty JSON array';
      }
    } catch {
      errors.rankingMetaData = 'Must be valid JSON';
    }
  }

  return errors;
}
