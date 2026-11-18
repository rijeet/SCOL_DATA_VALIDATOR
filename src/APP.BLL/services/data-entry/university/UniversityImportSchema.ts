import type { CsvImportSchema } from '../common/abstractions/CsvImportSchema';
import { normalizeCommissionType } from '@shared/constants/amountTypes.constants';

/** Matches scol-backend university.csv headers. */
export const UNIVERSITY_INPUT_HEADERS = [
  'uniName',
  'countryName',
  'stateName',
  'cityName',
  'address',
  'commissionType',
  'commission',
  'logoUrl',
  'website',
  'aboutUs',
  'coverImageUrl',
  'campusLifeLinks',
  'rankingMetaData',
  'locationMapMetaData',
  'establishedYear',
  'universityType',
  'currRanking',
] as const;

export type UniversityStagingFieldKey = (typeof UNIVERSITY_INPUT_HEADERS)[number];

export const UniversityImportSchema: CsvImportSchema = {
  inputHeaders: [...UNIVERSITY_INPUT_HEADERS],
  reviewedHeaders: [...UNIVERSITY_INPUT_HEADERS],
  errorHeaders: [...UNIVERSITY_INPUT_HEADERS, 'errorReason'],
};

export function normalizeStagingUniversityRow(
  row: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of UNIVERSITY_INPUT_HEADERS) {
    const v = row[key];
    out[key] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  }
  const commissionType = normalizeCommissionType(out.commissionType);
  if (commissionType) out.commissionType = commissionType;
  return out;
}
