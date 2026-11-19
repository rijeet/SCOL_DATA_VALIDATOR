/** Shown under server validation messages to guide fixes. */
export const FIELD_FORMAT_HINTS: Record<string, string> = {
  intakeInfo:
    'Use month + year, comma-separated — e.g. September 2026, January 2027 or Sep-26, Jan-27',
  minGpa: 'Number on the scale for min degree (SSC/HSC up to 5.0; BSc/MSc up to 4.0)',
  higherGpa: 'Number on the scale for higher degree (SSC/HSC 5.0; BSc/MSc 4.0)',
  minDegreeName: 'Choose SSC, HSC, BSc, or MSc',
  higherDegreeName: 'Choose SSC, HSC, BSc, or MSc — required when higher GPA is filled in',
  AcademicRequirementsMetaData:
    'JSON array of items: [{"subtitle":"…","description":"…"}]. Click Format JSON after fixing syntax.',
  feesMetaData:
    'JSON array: [{"subtitle":"Fees","description":"…"}]. Click Format JSON after fixing syntax.',
  scholarshipMetaData:
    'Required when the amount is greater than 0. Leave empty when the amount is 0 or there is no scholarship. JSON array: [{"subtitle":"…","description":["…"]}]',
  scholarshipAmount: 'Plain digits only, e.g. 5500 — no commas, currency symbols, or spaces',
  ieltsMinOverall: '0–9 (e.g. 6.5). Overall cannot exceed 9.',
  ieltsMinSection: '0–9 (e.g. 5.5). Each band cannot exceed 9.',
  toeflMinOverall: '0–120 (e.g. 88)',
  toeflMinSection: '0–30 per section (e.g. 17)',
  pteMinOverall: '0–90 (e.g. 61)',
  pteMinSection: '0–90 (e.g. 59)',
  tuitionFee: 'Plain digits only, e.g. 19500 — no commas, currency symbols, or spaces',
  currency: 'e.g. GBP — empty shows as Missing',
  initialDeposit: 'Numbers only — empty shows as Missing',
  applicationFee: 'Numbers only — empty shows as Missing',
  commission: 'Numbers only — empty shows as Missing',
  commissionType: 'Choose Amount or Percentage',
  scholarshipType: 'Choose Amount or Percentage',
  applicationDeadline: 'e.g. 08-31-2026 — empty shows as Missing',
  courseDuration:
    'One number of months, e.g. 24 or 24 months. Two values such as 24, 48 are invalid.',
  courseUrlExternal: 'Full course URL — empty shows as Missing',
  courseKey:
    'Stable identity for DATA FIX. Same URL can be used by foundation/placement siblings — do not edit.',
  logoUrl:
    'Choose a JPEG, PNG, or WebP logo (max 5 MB), or paste a full http(s) URL',
  coverImageUrl:
    'Choose a JPEG, PNG, or WebP cover (max 5 MB), or paste a full http(s) URL',
  website: 'Full website URL starting with http:// or https://',
  campusLifeLinks:
    'Quoted YouTube/video URLs, e.g. "https://youtu.be/abc", "https://youtu.be/def". No commas inside a URL.',
  locationMapMetaData:
    'Google Maps URL, or JSON like {"href":"https://maps.google.com/...","text":"Map"}',
  rankingMetaData:
    'Pretty JSON array: [{"subtitle":"Ranking","description":["…"]}]. Click Format JSON after fixing syntax.',
};

export function hintForField(fieldKey: string): string | undefined {
  return FIELD_FORMAT_HINTS[fieldKey];
}
