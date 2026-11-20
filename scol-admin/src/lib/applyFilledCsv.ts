import { apiFetch } from './api';
import {
  uploadPrivateObject,
  type PrivateObjectUpload,
} from './privateObjectUpload';

export type ApplyFilledSkip = {
  courseKey: string;
  reason: string;
};

export type ApplyFilledResult = {
  updated: number;
  catalogUpdated: number;
  skipped: ApplyFilledSkip[];
};

/**
 * Upload a DATA FIX 4_col_filled CSV to private storage, then patch staging + catalog
 * by courseKey. Does not replace the original course CSV.
 */
export async function applyFilledCsv(
  batchId: string,
  file: File,
): Promise<ApplyFilledResult> {
  const signed = await apiFetch<{ csv: PrivateObjectUpload }>(
    `/data-entry/batches/${batchId}/apply-filled-upload-url`,
    {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        fileSizeBytes: file.size,
      }),
    },
  );
  await uploadPrivateObject(file, signed.csv);
  return apiFetch<ApplyFilledResult>(
    `/data-entry/batches/${batchId}/apply-filled-confirm`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}
