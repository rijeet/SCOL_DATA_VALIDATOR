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
  levelOrder: number;
  courseCount: number;
  courseCountByCountryId: Record<string, number>;
};

export type DashboardEnglishTestItem = {
  id: string;
  name: string;
  minScore: number | null;
  maxScore: number | null;
};

export type DashboardScholarshipItem = {
  uniId: string;
  uniName: string;
  countryId: string;
  degreeId: string;
  degreeName: string;
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
  scholarships: DashboardScholarshipItem[];
  intakesByUni: DashboardUniIntakes[];
  geo: {
    countries: DashboardGeoItem[];
    statesByCountryId: Record<string, DashboardGeoItem[]>;
    citiesByStateId: Record<string, DashboardGeoItem[]>;
  };
};

export type DashboardSnapshotResponse = {
  payload: DashboardSnapshotPayload | null;
};
