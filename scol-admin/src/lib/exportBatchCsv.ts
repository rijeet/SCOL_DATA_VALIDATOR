import { apiFetch } from './api';

type RowResponse = {
  rowIndex: number;
  fields: Record<string, string>;
};

/** Columns that are editor-only and should not appear in the exported file. */
const SKIP_COLUMNS = new Set(['errorReason']);

/** Column order of the exported CSV. Any other column is added after these. */
const COLUMN_ORDER = [
  'uniName',
  'programmeName',
  'courseName',
  'degreeName',
  'minDegreeName',
  'minGpa',
  'higherDegreeName',
  'higherGpa',
  'intakeInfo',
  'courseDuration',
  'currency',
  'tuitionFee',
  'initialDeposit',
  'feesMetaData',
  'commission',
  'applicationFee',
  'applicationDeadline',
  'courseUrlExternal',
  'ieltsMinOverall',
  'ieltsMinSection',
  'pteMinOverall',
  'pteMinSection',
  'toeflMinOverall',
  'toeflMinSection',
  'scholarshipName',
  'scholarshipType',
  'scholarshipAmount',
  'scholarshipMetaData',
  'AcademicRequirementsMetaData',
] as const;

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'university';
}

/**
 * Loads every row of a batch and downloads them as one CSV file.
 * Rows are fetched a few at a time so large universities stay quick.
 */
export async function exportBatchCsv(
  batchId: string,
  rowCount: number,
  universityName: string,
  onProgress?: (done: number, total: number) => void,
  fileSuffix = 'fixed',
): Promise<void> {
  if (rowCount <= 0) throw new Error('No courses to export');

  const rows: Record<string, string>[] = new Array(rowCount);
  let nextIndex = 1;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i > rowCount) return;
      const r = await apiFetch<RowResponse>(
        `/data-entry/batches/${batchId}/rows/${i}`,
      );
      rows[i - 1] = r.fields;
      done++;
      onProgress?.(done, rowCount);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(6, rowCount) }, () => worker()),
  );

  const headers: string[] = [...COLUMN_ORDER];
  const seen = new Set<string>(COLUMN_ORDER);
  for (const fields of rows) {
    for (const key of Object.keys(fields ?? {})) {
      if (SKIP_COLUMNS.has(key) || seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }

  const lines = [headers.map(csvCell).join(',')];
  for (const fields of rows) {
    lines.push(headers.map((h) => csvCell(fields?.[h] ?? '')).join(','));
  }

  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(universityName)}_${fileSuffix}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
