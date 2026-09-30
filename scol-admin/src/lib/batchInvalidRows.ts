import { apiFetch } from './api';

export type BatchInvalidMeta = {
  invalidRowCount: number;
  rowCount?: number;
};

/** Lowest rowIndex with validation errors (API returns ascending list). */
export async function fetchInvalidRowIndexes(batchId: string): Promise<number[]> {
  return apiFetch<number[]>(`/data-entry/batches/${batchId}/invalid-rows`);
}

/**
 * Row to open when starting validation: first invalid row, or 1 if none.
 * Pass `batch.invalidRowCount` when already known to skip an extra batch GET.
 */
export async function resolveInitialRowIndex(
  batchId: string,
  batch?: BatchInvalidMeta,
): Promise<number> {
  let invalidCount = batch?.invalidRowCount;
  if (invalidCount === undefined) {
    const meta = await apiFetch<BatchInvalidMeta>(
      `/data-entry/batches/${batchId}`,
    );
    invalidCount = meta.invalidRowCount;
  }
  if (!invalidCount || invalidCount <= 0) {
    return 1;
  }

  const indexes = await fetchInvalidRowIndexes(batchId);
  return indexes[0] ?? 1;
}

export function adjacentInvalidIndex(
  indexes: number[],
  current: number,
  direction: 'next' | 'prev',
): number | null {
  if (indexes.length === 0) return null;
  if (direction === 'next') {
    return indexes.find((i) => i > current) ?? null;
  }
  for (let i = indexes.length - 1; i >= 0; i--) {
    if (indexes[i] < current) return indexes[i];
  }
  return null;
}
