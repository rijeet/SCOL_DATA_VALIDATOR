/** Root folder in Cloudinary for all university packs. */
export const DATA_ENTRY_CLOUD_ROOT_DEFAULT = 'SCOL_DATA';

export const DATA_ENTRY_REVIEWED_CSV_MARKER = '_reviewed';

/** API helper keys → paths under `SCOL_DATA/{universityName}/`. */
export const DATA_ENTRY_HELPER_CLOUD_PATHS = {
  bd_entry: 'clean/uni/bangladesh-entry.md',
  deposit: 'clean/uni/deposit.md',
  eng_req: 'clean/uni/english-requirements.md',
  scholarship: 'clean/uni/scholarships.md',
} as const;

export type DataEntryHelperKey = keyof typeof DATA_ENTRY_HELPER_CLOUD_PATHS;

export const DATA_ENTRY_HELPER_KEYS = Object.keys(
  DATA_ENTRY_HELPER_CLOUD_PATHS,
) as DataEntryHelperKey[];

export const DATA_ENTRY_MAX_FILE_BYTES = 20 * 1024 * 1024;

export const UNIVERSITY_IMAGE_CLOUD_PREFIX = 'universities';

export const UNIVERSITY_IMAGE_KINDS = ['logo', 'cover'] as const;

export type UniversityImageKind = (typeof UNIVERSITY_IMAGE_KINDS)[number];

export const UNIVERSITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const UNIVERSITY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type UniversityImageMimeType =
  (typeof UNIVERSITY_IMAGE_MIME_TYPES)[number];

export const UNIVERSITY_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
] as const;
