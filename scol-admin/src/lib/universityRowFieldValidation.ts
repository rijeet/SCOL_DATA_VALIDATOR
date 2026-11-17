export const UNIVERSITY_ROW_REQUIRED_FIELDS = [
  'uniName',
  'countryName',
  'stateName',
  'cityName',
  'address',
  'commissionType',
  'commission',
  'logoUrl',
  'website',
  'aboutUs',
  'coverImageUrl',
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

export function youTubeId(url = ''): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
}

export function locationLine(fields: Record<string, string>): string {
  return [fields.cityName, fields.stateName, fields.countryName]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export function serializeCampusLifeLinks(urls: string[]): string {
  return urls
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => `"${u}"`)
    .join(', ');
}

export function campusLinkDraft(raw: string): string[] {
  const { urls } = parseCampusLifeLinks(raw);
  return urls.length ? urls : [''];
}
