export type ScholarshipMetaClearGroup = {
  metadata: string;
  courseCount: number;
};

export type ScholarshipMetaMissingGroup = {
  name: string;
  amount: string;
  courseCount: number;
};

export type ScholarshipMetaPreview = {
  clearGroups: ScholarshipMetaClearGroup[];
  missingGroups: ScholarshipMetaMissingGroup[];
};

export type ScholarshipMetaSample = {
  name: string;
  amount: string;
  metadata: string;
};

export type ScholarshipMetaFill = {
  name: string;
  amount: number;
  metadata: string;
};

export function scholarshipAmountNumber(
  raw: string | null | undefined,
): number | null {
  const text = (raw ?? '').trim().replace(/,/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function metadataText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function collectScholarshipMetaPreview(
  samples: ScholarshipMetaSample[],
): ScholarshipMetaPreview {
  const clear = new Map<string, ScholarshipMetaClearGroup>();
  const missing = new Map<string, ScholarshipMetaMissingGroup>();
  for (const sample of samples) {
    const amount = scholarshipAmountNumber(sample.amount);
    const meta = sample.metadata.trim();
    if (amount != null && amount > 0) {
      if (meta) continue;
      const name = sample.name.trim();
      const amountKey = String(amount);
      const key = `${name.toLowerCase()}\0${amountKey}`;
      const row = missing.get(key);
      if (row) row.courseCount += 1;
      else missing.set(key, { name, amount: amountKey, courseCount: 1 });
      continue;
    }
    if (!meta) continue;
    const row = clear.get(meta);
    if (row) row.courseCount += 1;
    else clear.set(meta, { metadata: meta, courseCount: 1 });
  }
  const byCount = (
    a: { courseCount: number },
    b: { courseCount: number },
  ) => b.courseCount - a.courseCount;
  return {
    clearGroups: [...clear.values()].sort(byCount),
    missingGroups: [...missing.values()].sort(byCount),
  };
}

export function rewriteScholarshipMeta(
  fields: Record<string, string>,
  clears: Set<string>,
  fills: ScholarshipMetaFill[],
): Record<string, string> | null {
  const amount = scholarshipAmountNumber(fields.scholarshipAmount);
  const meta = (fields.scholarshipMetaData ?? '').trim();
  if (amount != null && amount > 0) {
    if (meta) return null;
    const name = (fields.scholarshipName ?? '').trim().toLowerCase();
    const fill = fills.find((item) => item.name === name && item.amount === amount);
    if (!fill) return null;
    return { ...fields, scholarshipMetaData: fill.metadata };
  }
  if (meta && clears.has(meta)) {
    return { ...fields, scholarshipMetaData: '' };
  }
  return null;
}
