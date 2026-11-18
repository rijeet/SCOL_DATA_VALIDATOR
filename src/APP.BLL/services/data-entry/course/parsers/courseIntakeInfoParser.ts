const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_FULL: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export type ParsedIntake = { month: number; year: number };

function parseYear(yStr: string): number | null {
  if (yStr.length === 4) {
    const year = Number(yStr);
    return Number.isNaN(year) ? null : year;
  }
  const yy = Number(yStr);
  if (Number.isNaN(yy)) return null;
  return yy < 100 ? 2000 + yy : yy;
}

function monthFromName(name: string): number | null {
  const lower = name.toLowerCase();
  if (MONTH_FULL[lower] !== undefined) {
    return MONTH_FULL[lower];
  }
  const abbr = lower.slice(0, 3);
  return MONTH_ABBR[abbr] ?? null;
}

/**
 * Parses one intake token such as `Sep-26`, `Sep 2026`, `September 2026`.
 * Two-digit years use 2000+year when year < 100.
 */
function parseSingleIntakeToken(token: string): ParsedIntake | null {
  const t = token.trim();
  if (!t) return null;

  const m = t.match(/^([A-Za-z]+)[-\s]+(\d{2}|\d{4})$/i);
  if (!m) return null;

  const mon = monthFromName(m[1]);
  if (!mon) return null;

  const year = parseYear(m[2]);
  if (year === null) return null;

  return { month: mon, year };
}

/** First parseable intake, or null. */
export function parseIntakeInfo(raw: string): ParsedIntake | null {
  return parseIntakeInfoList(raw)[0] ?? null;
}

/**
 * Parses intakeInfo; supports comma-separated values
 * (e.g. `Sep-26, Dec-26` or `September 2026, January 2027`).
 * Invalid tokens are skipped; returns only successfully parsed intakes.
 */
export function parseIntakeInfoList(raw: string): ParsedIntake[] {
  const t = raw.trim();
  if (!t) return [];

  const tokens = t.includes(',')
    ? t.split(',').map((part) => part.trim()).filter(Boolean)
    : [t];

  const intakes: ParsedIntake[] = [];
  for (const token of tokens) {
    const parsed = parseSingleIntakeToken(token);
    if (parsed) intakes.push(parsed);
  }
  return intakes;
}

const MONTH_LABELS = [
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

/** Catalog intakes back to CSV-style `Sep-26, Jan-27`. */
export function formatIntakeInfoList(intakes: ParsedIntake[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const sorted = [...intakes].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
  );
  for (const item of sorted) {
    const key = `${item.year}-${item.month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = MONTH_LABELS[item.month - 1];
    if (!label) continue;
    parts.push(`${label}-${String(item.year).slice(-2)}`);
  }
  return parts.join(', ');
}
