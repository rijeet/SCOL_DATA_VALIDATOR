/** Shown under server validation messages to guide fixes. */
export const FIELD_FORMAT_HINTS: Record<string, string> = {
  intakeInfo:
    'Use month + year, comma-separated — e.g. September 2026, January 2027 or Sep-26, Jan-27',
  minGpa: 'Number on the scale for min degree (SSC/HSC up to 5.0; BSc/MSc up to 4.0)',
  higherGpa: 'Number on the scale for higher degree (SSC/HSC 5.0; BSc/MSc 4.0)',
  higherDegreeName: 'Required when higher GPA is filled in',
  AcademicRequirementsMetaData:
    'JSON array of items: [{"subtitle":"…","description":"…"}]. Click Format JSON after fixing syntax.',
  feesMetaData:
    'JSON array: [{"subtitle":"Fees","description":"…"}]. Click Format JSON after fixing syntax.',
  scholarshipMetaData:
    'JSON array: [{"subtitle":"…","description":"…"}]. Click Format JSON after fixing syntax.',
  scholarshipAmount: 'Numbers only',
  ieltsMinOverall: '0–9 (e.g. 6.5). Overall cannot exceed 9.',
  ieltsMinSection: '0–9 (e.g. 5.5). Each band cannot exceed 9.',
  toeflMinOverall: '0–120 (e.g. 88)',
  toeflMinSection: '0–30 per section (e.g. 17)',
  pteMinOverall: '0–90 (e.g. 61)',
  pteMinSection: '0–90 (e.g. 59)',
  tuitionFee: 'Numbers only, e.g. 19500 — empty shows as Missing',
  currency: 'e.g. GBP — empty shows as Missing',
  initialDeposit: 'Numbers only — empty shows as Missing',
  applicationFee: 'Numbers only — empty shows as Missing',
  commission: 'Numbers only — empty shows as Missing',
  applicationDeadline: 'e.g. 2026-08-31 — empty shows as Missing',
  courseDuration: 'Months as a number, e.g. 12 — empty shows as Missing',
  courseUrlExternal: 'Full course URL — empty shows as Missing',
};

export function hintForField(fieldKey: string): string | undefined {
  return FIELD_FORMAT_HINTS[fieldKey];
}
