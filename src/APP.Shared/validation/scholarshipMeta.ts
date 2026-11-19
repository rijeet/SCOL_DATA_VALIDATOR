export type ScholarshipMetaCourse = {
  courseName: string;
  uniName: string;
  batchId: string;
  rowIndex: number;
  rowCount: number;
  universityKey: string;
};

export type ScholarshipMetaClearGroup = {
  metadata: string;
  courseCount: number;
  courses: ScholarshipMetaCourse[];
};

export type ScholarshipMetaMissingGroup = {
  name: string;
  amount: string;
  courseCount: number;
  courses: ScholarshipMetaCourse[];
};

export type ScholarshipMetaPreview = {
  clearGroups: ScholarshipMetaClearGroup[];
  missingGroups: ScholarshipMetaMissingGroup[];
};

export type ScholarshipMetaSample = {
  name: string;
  amount: string;
  metadata: string;
  course?: ScholarshipMetaCourse | null;
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
      if (row) {
        row.courseCount += 1;
        pushCourse(row.courses, sample.course);
      } else {
        missing.set(key, {
          name,
          amount: amountKey,
          courseCount: 1,
          courses: sample.course ? [sample.course] : [],
        });
      }
      continue;
    }
    if (!meta) continue;
    const row = clear.get(meta);
    if (row) {
      row.courseCount += 1;
      pushCourse(row.courses, sample.course);
    } else {
      clear.set(meta, {
        metadata: meta,
        courseCount: 1,
        courses: sample.course ? [sample.course] : [],
      });
    }
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

function pushCourse(
  courses: ScholarshipMetaCourse[],
  course: ScholarshipMetaCourse | null | undefined,
) {
  if (!course) return;
  if (
    courses.some(
      (item) => item.batchId === course.batchId && item.rowIndex === course.rowIndex,
    )
  ) {
    return;
  }
  courses.push(course);
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
