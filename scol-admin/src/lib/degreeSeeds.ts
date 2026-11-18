/** Mirrors backend @shared/constants/degreeSeeds.constants (keep in sync). */

export const DEGREE_SEEDS = [
  { degreeName: 'SSC', levelOrder: 1, gpaScale: '5.00' },
  { degreeName: 'HSC', levelOrder: 2, gpaScale: '5.00' },
  { degreeName: 'BSc', levelOrder: 3, gpaScale: '4.00' },
  { degreeName: 'MSc', levelOrder: 4, gpaScale: '4.00' },
] as const;

export type EntryDegreeName = (typeof DEGREE_SEEDS)[number]['degreeName'];

export const ENTRY_DEGREE_NAMES = DEGREE_SEEDS.map(
  (d) => d.degreeName,
) as unknown as EntryDegreeName[];

export function canonicalEntryDegreeName(
  raw: string | undefined,
): EntryDegreeName | null {
  const t = (raw ?? '').trim().toUpperCase();
  if (!t) return null;
  const found = DEGREE_SEEDS.find((d) => d.degreeName.toUpperCase() === t);
  return found?.degreeName ?? null;
}

export function gpaScaleForEntryDegree(name: EntryDegreeName): number {
  const seed = DEGREE_SEEDS.find((d) => d.degreeName === name);
  return seed ? Number(seed.gpaScale) : 4;
}

export function entryDegreeLabels(): string {
  return ENTRY_DEGREE_NAMES.join(', ');
}
