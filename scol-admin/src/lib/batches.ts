export type BatchKind = 'UNIVERSITY' | 'COURSE';

export type DestinationItem = {
  sysCountryId: string;
  countryName: string;
  countryCode: string | null;
  batchCount: number;
  readyCount: number;
};

export type BatchItem = {
  id: string;
  batchType: BatchKind;
  displayName: string;
  sourceFileName?: string | null;
  universityKey?: string;
  sysUniversityId?: string | null;
  status: string;
  rowCount: number;
  invalidRowCount: number;
  publishedAt?: string | null;
  failureReason?: string | null;
};

export type CountryUniversityItem = {
  sysUniversityId: string;
  uniName: string;
  staging?: {
    batchId: string;
    rowCount: number;
    invalidRowCount: number;
    validRowCount: number;
    status: string;
    publishedAt?: string | null;
  } | null;
};

export function parseBatchKind(raw: string | null | undefined): BatchKind {
  return raw === 'COURSE' ? 'COURSE' : 'UNIVERSITY';
}

export function statusLabel(b: BatchItem): string {
  if (b.status === 'PUBLISHED') return 'Published';
  if (b.status === 'VALIDATED') return 'Ready to publish';
  if (b.status === 'FAILED') return 'Failed';
  if (b.status === 'AWAITING_UPLOAD') return 'Waiting for upload';
  if (b.invalidRowCount > 0) return `${b.invalidRowCount} to fix`;
  return b.status;
}

export function validRowCount(b: {
  rowCount: number;
  invalidRowCount: number;
}): number {
  return Math.max(0, b.rowCount - b.invalidRowCount);
}

/** True when at least one valid row can be written to catalog. */
export function canPublishValidRows(b: {
  status: string;
  rowCount: number;
  invalidRowCount: number;
}): boolean {
  if (validRowCount(b) <= 0) return false;
  return (
    b.status !== 'PUBLISHED' &&
    b.status !== 'AWAITING_UPLOAD' &&
    b.status !== 'FAILED' &&
    b.status !== 'IMPORTING'
  );
}

export function publishButtonLabel(b: { invalidRowCount: number }): string {
  return b.invalidRowCount > 0 ? 'Publish valid' : 'Publish';
}
