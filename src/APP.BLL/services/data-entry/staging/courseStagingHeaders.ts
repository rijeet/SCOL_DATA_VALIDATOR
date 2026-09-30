import type { CsvRow } from '../common/abstractions/CsvImportProcessor';
import { CourseImportSchema } from '../course/CourseImportSchema';
import {
  DATA_ENTRY_HELPER_CLOUD_PATHS,
  type DataEntryHelperKey,
} from '@shared/constants/dataEntryCloud.constants';

export { DATA_ENTRY_HELPER_CLOUD_PATHS, type DataEntryHelperKey };

/** Extra CSV columns kept in staging (not part of catalog publish schema). */
export const STAGING_ONLY_HEADERS = ['errorReason'] as const;

export const COURSE_STAGING_FIELD_KEYS = [
  ...CourseImportSchema.inputHeaders,
  ...STAGING_ONLY_HEADERS,
] as const;

export type CourseStagingFieldKey = (typeof COURSE_STAGING_FIELD_KEYS)[number];

export function normalizeStagingCourseRow(row: CsvRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of COURSE_STAGING_FIELD_KEYS) {
    const v = row[key];
    out[key] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  }
  return out;
}
