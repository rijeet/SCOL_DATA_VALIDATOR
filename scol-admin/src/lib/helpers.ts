export const HELPER_TABS = [
  { key: 'bd_entry', label: 'Bangladesh entry' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'eng_req', label: 'English requirements' },
  { key: 'scholarship', label: 'Scholarships' },
] as const;

export type HelperKey = (typeof HELPER_TABS)[number]['key'];
