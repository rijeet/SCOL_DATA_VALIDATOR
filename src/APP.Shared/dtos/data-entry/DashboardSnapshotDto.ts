export type DashboardGeoItem = {
  id: string;
  name: string;
};

export type DashboardUniversityCount = {
  id: string;
  name: string;
  courseCount: number;
};

export type DashboardCountrySlice = {
  id: string;
  name: string;
  code: string | null;
  universityCount: number;
  courseCount: number;
  universities: DashboardUniversityCount[];
};

export type DashboardDegreeItem = {
  id: string;
  name: string;
  levelOrder: number | null;
  courseCount: number;
  courseCountByCountryId: Record<string, number>;
};

export type DashboardEnglishTestItem = {
  id: string;
  name: string;
  minScore: number | null;
  maxScore: number | null;
};

export type DashboardEnglishScoreGroup = {
  overall: string;
  section: string;
  courseCount: number;
};

export type DashboardEnglishTestGroups = {
  id: string;
  name: string;
  groups: DashboardEnglishScoreGroup[];
};

export type DashboardUniEnglishTests = {
  uniId: string;
  uniName: string;
  countryId: string;
  tests: DashboardEnglishTestGroups[];
};

export type DashboardTuitionGroup = {
  currency: string;
  amount: string;
  year: number;
  month: number;
  courseCount: number;
};

export type DashboardUniTuition = {
  uniId: string;
  uniName: string;
  countryId: string;
  groups: DashboardTuitionGroup[];
};

export type DashboardScholarshipItem = {
  uniId: string;
  uniName: string;
  countryId: string;
  degreeId: string;
  degreeName: string;
  name: string | null;
  amount: string | null;
  amountType: string | null;
  courseCount: number;
};

export type DashboardIntakeChip = {
  year: number;
  month: number;
  intakeKey: number;
  courseCount: number;
};

export type DashboardUniIntakes = {
  uniId: string;
  uniName: string;
  countryId: string;
  intakes: DashboardIntakeChip[];
};

export type DashboardProgrammeItem = {
  id: string;
  name: string;
  courseCount: number;
  courseCountByUniId: Record<string, number>;
};

export type DashboardEntryDegreeGroup = {
  uniId: string;
  uniName: string;
  countryId: string;
  minDegreeId: string;
  minDegreeName: string;
  minGpa: string | null;
  highDegreeId: string | null;
  highDegreeName: string | null;
  highGpa: string | null;
  courseCount: number;
};

export type DashboardSnapshotPayload = {
  updatedAt: string;
  totals: {
    countries: number;
    universities: number;
    courses: number;
  };
  byCountry: DashboardCountrySlice[];
  degrees: DashboardDegreeItem[];
  englishTests: DashboardEnglishTestItem[];
  englishByUni: DashboardUniEnglishTests[];
  tuitionByUni: DashboardUniTuition[];
  scholarships: DashboardScholarshipItem[];
  intakesByUni: DashboardUniIntakes[];
  programmes: DashboardProgrammeItem[];
  entryDegreesByUni: DashboardEntryDegreeGroup[];
  geo: {
    countries: DashboardGeoItem[];
    statesByCountryId: Record<string, DashboardGeoItem[]>;
    citiesByStateId: Record<string, DashboardGeoItem[]>;
  };
};

export type DashboardSnapshotResponse = {
  payload: DashboardSnapshotPayload | null;
};

export type DashboardDegreeCourseItem = {
  uniId: string;
  uniName: string;
  courseName: string;
  programmeName: string | null;
  universityKey: string;
  batchId: string | null;
  rowIndex: number | null;
  rowCount: number | null;
  score?: string | null;
};

export type DashboardDegreeCourseList = {
  degreeId: string;
  degreeName: string;
  courses: DashboardDegreeCourseItem[];
};
