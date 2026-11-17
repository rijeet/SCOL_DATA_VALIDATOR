import { apiDownload } from './api';

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'export';
}

/**
 * Downloads the server-built valid-only CSV for a staging batch.
 */
export async function exportBatchCsv(
  batchId: string,
  universityName = 'export',
): Promise<void> {
  await apiDownload(
    `/data-entry/batches/${batchId}/export.csv`,
    `${safeFileName(universityName)}_valid.csv`,
  );
}
