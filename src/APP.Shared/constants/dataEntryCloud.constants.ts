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
