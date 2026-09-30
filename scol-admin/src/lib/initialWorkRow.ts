import { apiFetch } from './api';

type BatchMeta = { invalidRowCount: number; rowCount: number };

/** Open at the first row that still has validation errors; otherwise row 1. */
export async function resolveInitialRowIndex(
  batchId: string,
  batch?: BatchMeta,
): Promise<number> {
  let invalidCount = batch?.invalidRowCount;
  if (invalidCount === undefined) {
    const b = await apiFetch<BatchMeta>(`/data-entry/batches/${batchId}`);
    invalidCount = b.invalidRowCount;
  }
  if (!invalidCount || invalidCount <= 0) {
    return 1;
  }

  try {
    const res = await apiFetch<{ rowIndex: number | null }>(
      `/data-entry/batches/${batchId}/first-invalid-row`,
    );
    if (res.rowIndex != null) {
      return res.rowIndex;
    }
  } catch {
    try {
      const list = await apiFetch<number[]>(
        `/data-entry/batches/${batchId}/invalid-rows`,
      );
      if (list.length > 0) {
        return list[0];
      }
    } catch {
      /* old API — start at row 1 */
    }
  }
  return 1;
}
