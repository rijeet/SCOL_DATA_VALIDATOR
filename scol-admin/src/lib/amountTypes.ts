/** Mirrors backend @shared/constants/amountTypes.constants (keep in sync). */

export const SCHOLARSHIP_TYPE_AMOUNT = 'Amount';
export const SCHOLARSHIP_TYPE_PERCENTAGE = 'Percentage';

export const AMOUNT_TYPES = [
  {
    typeName: SCHOLARSHIP_TYPE_AMOUNT,
    typeCode: 'AMOUNT',
    displayOrder: 1,
  },
  {
    typeName: SCHOLARSHIP_TYPE_PERCENTAGE,
    typeCode: 'PERCENTAGE',
    displayOrder: 2,
  },
] as const;

export type ScholarshipTypeName = (typeof AMOUNT_TYPES)[number]['typeName'];
export type CommissionTypeCode = (typeof AMOUNT_TYPES)[number]['typeCode'];

export function normalizeCommissionType(
  raw: string | undefined,
): CommissionTypeCode | null {
  const t = (raw ?? '').trim().toUpperCase();
  if (t === 'AMOUNT') return 'AMOUNT';
  if (t === 'PERCENTAGE' || t === 'PERCENT' || t === '%') return 'PERCENTAGE';
  return null;
}

export function normalizeScholarshipType(
  raw: string | undefined,
): ScholarshipTypeName | null {
  const code = normalizeCommissionType(raw);
  if (code === 'AMOUNT') return SCHOLARSHIP_TYPE_AMOUNT;
  if (code === 'PERCENTAGE') return SCHOLARSHIP_TYPE_PERCENTAGE;
  return null;
}

export function scholarshipTypeLabels(): string {
  return AMOUNT_TYPES.map((t) => t.typeName).join(' or ');
}

export function commissionTypeLabel(raw: string | undefined): string {
  return normalizeScholarshipType(raw) ?? (raw ?? '').trim();
}
