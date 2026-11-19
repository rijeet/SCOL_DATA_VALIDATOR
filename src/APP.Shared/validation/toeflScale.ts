export type ToeflScoreKind = 'overall' | 'section';

export type ToeflPreviewItem = {
  kind: ToeflScoreKind;
  score: string;
  courseCount: number;
  suggested: string | null;
  status: 'mapped' | 'no-match';
};

export type ToeflPreview = {
  hasOldScore: boolean;
  items: ToeflPreviewItem[];
};

/** ETS Speaking (0–30) band only, index is the old section score. */
const SECTION_BAND = [
  1, 1, 1, 1, 1, 1.5, 1.5, 1.5, 1.5, 1.5, 2, 2, 2, 2.5, 2.5, 2.5, 3, 3, 3.5,
  3.5, 4, 4, 4, 4.5, 4.5, 5, 5, 5.5, 6, 6, 6,
];

const OVERALL_BANDS: [number, number][] = [
  [114, 6],
  [107, 5.5],
  [95, 5],
  [86, 4.5],
  [72, 4],
  [58, 3.5],
  [44, 3],
  [34, 2.5],
  [24, 2],
  [12, 1.5],
];

export function toeflScoreKey(raw: string): string {
  const text = raw.trim();
  const n = Number(text.replace(/,/g, ''));
  if (!text || !Number.isFinite(n)) return text;
  return Number.isInteger(n) ? String(n) : String(n);
}

export function classifyToeflScore(
  kind: ToeflScoreKind,
  raw: string,
): { status: 'skip' } | { status: 'mapped'; suggested: string } | { status: 'no-match' } {
  const text = raw.trim();
  if (!text) return { status: 'skip' };
  const n = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(n)) return { status: 'no-match' };
  if (n >= 1 && n <= 6) return { status: 'skip' };
  if (kind === 'overall') {
    if (n < 0 || n > 120) return { status: 'no-match' };
    if (n <= 6) return { status: 'skip' };
    return { status: 'mapped', suggested: formatBand(overallBand(n)) };
  }
  if (n < 0 || n > 30) return { status: 'no-match' };
  if (n <= 6) return { status: 'skip' };
  const index = Math.round(n);
  const band = SECTION_BAND[index];
  if (band == null) return { status: 'no-match' };
  return { status: 'mapped', suggested: formatBand(band) };
}

export function collectToeflPreview(
  values: { kind: ToeflScoreKind; raw: string }[],
): ToeflPreview {
  const counts = new Map<string, ToeflPreviewItem>();
  for (const value of values) {
    const classified = classifyToeflScore(value.kind, value.raw);
    if (classified.status === 'skip') continue;
    const score = toeflScoreKey(value.raw);
    const key = `${value.kind}\0${score}`;
    const current = counts.get(key);
    if (current) {
      current.courseCount += 1;
      continue;
    }
    counts.set(key, {
      kind: value.kind,
      score,
      courseCount: 1,
      suggested: classified.status === 'mapped' ? classified.suggested : null,
      status: classified.status,
    });
  }
  const items = [...counts.values()].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      (Number(a.score) || 0) - (Number(b.score) || 0) ||
      a.score.localeCompare(b.score),
  );
  return { hasOldScore: items.length > 0, items };
}

export function mapImportedToefl(overall: string, section: string): {
  overall: string;
  section: string;
} {
  return {
    overall: replaceIfMapped('overall', overall),
    section: replaceIfMapped('section', section),
  };
}

export function isNewToeflScore(raw: string): boolean {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 1 && n <= 6;
}

function replaceIfMapped(kind: ToeflScoreKind, raw: string): string {
  const classified = classifyToeflScore(kind, raw);
  if (classified.status !== 'mapped') return raw;
  return classified.suggested;
}

export function checkedToeflPairs(
  pairs: { kind: ToeflScoreKind; from: string; to: string }[],
  reject: (message: string) => never,
): { kind: ToeflScoreKind; from: string; to: string }[] {
  return pairs.map((pair) => {
    if (!isNewToeflScore(pair.to)) {
      reject(`New ${pair.kind} score must be from 1 to 6`);
    }
    return {
      kind: pair.kind,
      from: toeflScoreKey(pair.from),
      to: toeflScoreKey(pair.to),
    };
  });
}

export function rewriteToeflFields(
  fields: Record<string, string>,
  pairs: { kind: ToeflScoreKind; from: string; to: string }[],
): Record<string, string> | null {
  const next = { ...fields };
  let changed = false;
  for (const pair of pairs) {
    const field = pair.kind === 'overall' ? 'toeflMinOverall' : 'toeflMinSection';
    if (toeflScoreKey(fields[field] ?? '') !== pair.from) continue;
    next[field] = pair.to;
    changed = true;
  }
  return changed ? next : null;
}

function overallBand(score: number): number {
  for (const [min, band] of OVERALL_BANDS) {
    if (score >= min) return band;
  }
  return 1;
}

function formatBand(band: number): string {
  return Number.isInteger(band) ? String(band) : String(band);
}
