import { apiDownload } from './api';

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'export';
}

/**
 * Downloads the server-built valid-only CSV for a staging batch.
 * Pass format `data-fix` for the 5-column DATA FIX working file.
 */
export async function exportBatchCsv(
  batchId: string,
  universityName = 'export',
  format?: 'data-fix',
): Promise<void> {
  const query = format === 'data-fix' ? '?format=data-fix' : '';
  const fallback =
    format === 'data-fix'
      ? `${safeFileName(universityName)}_courses.csv`
      : `${safeFileName(universityName)}_valid.csv`;
  await apiDownload(
    `/data-entry/batches/${batchId}/export.csv${query}`,
    fallback,
  );
}
