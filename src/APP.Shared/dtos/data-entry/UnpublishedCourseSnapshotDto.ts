export type UnpublishedUniversity = {
  batchId: string;
  uniName: string;
};

export type UnpublishedDegreeItem = {
  name: string;
  levelOrder: number | null;
  courseCount: number;
};

export type UnpublishedEnglishTestItem = {
  name: string;
  minScore: number | null;
  maxScore: number | null;
};

export type UnpublishedEnglishScoreGroup = {
  overall: string;
  section: string;
  courseCount: number;
};

export type UnpublishedEnglishTestGroups = {
  name: string;
  groups: UnpublishedEnglishScoreGroup[];
};

export type UnpublishedUniEnglishTests = {
  batchId: string;
  uniName: string;
  tests: UnpublishedEnglishTestGroups[];
};

export type UnpublishedTuitionGroup = {
  currency: string;
  amount: string;
  year: number;
  month: number;
  courseCount: number;
};

export type UnpublishedUniTuition = {
  batchId: string;
  uniName: string;
  groups: UnpublishedTuitionGroup[];
};

export type UnpublishedEntryDegreeGroup = {
  batchId: string;
  uniName: string;
  minDegreeName: string;
  highDegreeName: string | null;
  courseCount: number;
};

export type UnpublishedProgrammeItem = {
  name: string;
  courseCount: number;
};

export type UnpublishedScholarshipItem = {
  batchId: string;
  uniName: string;
  degreeName: string;
  name: string | null;
  amount: string | null;
  amountType: string | null;
  courseCount: number;
};

export type UnpublishedIntakeChip = {
  year: number;
  month: number;
  courseCount: number;
};

export type UnpublishedUniIntakes = {
  batchId: string;
  uniName: string;
  intakes: UnpublishedIntakeChip[];
};

export type UnpublishedCountryUniversity = {
  batchId: string;
  name: string;
  courseCount: number;
};

export type UnpublishedCountrySlice = {
  id: string;
  name: string;
  code: string | null;
  universityCount: number;
  courseCount: number;
  universities: UnpublishedCountryUniversity[];
};

export type UnpublishedCourseSnapshot = {
  totals: {
    countries: number;
    universities: number;
    courses: number;
  };
  countries: UnpublishedCountrySlice[];
  universities: UnpublishedUniversity[];
  degrees: UnpublishedDegreeItem[];
  englishTests: UnpublishedEnglishTestItem[];
  englishByUni: UnpublishedUniEnglishTests[];
  tuitionByUni: UnpublishedUniTuition[];
  entryDegrees: UnpublishedEntryDegreeGroup[];
  programmes: UnpublishedProgrammeItem[];
  scholarships: UnpublishedScholarshipItem[];
  intakesByUni: UnpublishedUniIntakes[];
};

export type UnpublishedDegreeCourseItem = {
  batchId: string;
  rowIndex: number;
  rowCount: number;
  universityKey: string;
  uniName: string;
  courseName: string;
  programmeName: string | null;
  score?: string | null;
};

export type UnpublishedDegreeCourseList = {
  degreeName: string;
  courses: UnpublishedDegreeCourseItem[];
};

export type UnpublishedPatchResult = {
  updated: number;
};
