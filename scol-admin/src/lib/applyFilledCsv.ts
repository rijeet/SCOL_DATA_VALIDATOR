import { apiFetch } from './api';
import {
  uploadFileToCloudinary,
  type CloudinarySignedUpload,
} from './cloudinaryUpload';

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
 * Upload a DATA FIX 4_col_filled CSV to Cloudinary, then patch staging + catalog
 * by courseKey. Does not replace the original course CSV.
 */
export async function applyFilledCsv(
  batchId: string,
  file: File,
): Promise<ApplyFilledResult> {
  const signed = await apiFetch<{ csv: CloudinarySignedUpload }>(
    `/data-entry/batches/${batchId}/apply-filled-upload-url`,
    {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        fileSizeBytes: file.size,
      }),
    },
  );
  await uploadFileToCloudinary(file, signed.csv);
  return apiFetch<ApplyFilledResult>(
    `/data-entry/batches/${batchId}/apply-filled-confirm`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}
