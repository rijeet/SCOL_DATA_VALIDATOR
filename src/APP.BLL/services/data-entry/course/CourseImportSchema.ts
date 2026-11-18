import type { CsvImportSchema } from '../common/abstractions/CsvImportSchema';

/** Matches [sys_course_details_template.csv](sys_course_details_template.csv) header row. */
const INPUT_HEADERS = [
  'courseKey',
  'uniName',
  'programmeName',
  'degreeName',
  'courseName',
  'minDegreeName',
  'minGpa',
  'higherDegreeName',
  'higherGpa',
  'AcademicRequirementsMetaData',
  'intakeInfo',
  'courseDuration',
  'tuitionFee',
  'currency',
  'initialDeposit',
  'applicationFee',
  'feesMetaData',
  'commission',
  'applicationDeadline',
  'ieltsMinOverall',
  'ieltsMinSection',
  'toeflMinOverall',
  'toeflMinSection',
  'pteMinOverall',
  'pteMinSection',
  'scholarshipName',
  'scholarshipAmount',
  'scholarshipType',
  'scholarshipMetaData',
  'courseUrlExternal',
] as const;

/** Resolved FK IDs written after successful import (audit / downstream joins). */
const REVIEWED_ID_HEADERS = [
  'uniId',
  'sysProgrammeId',
  'sysDegreeId',
  'minSysDegreeId',
  'higherSysDegreeId',
  'uniCourseId',
  'courseIntakeId',
  'sysEngTestIdIelts',
  'courseEngReqIdIelts',
  'sysEngTestIdToefl',
  'courseEngReqIdToefl',
  'sysEngTestIdPte',
  'courseEngReqIdPte',
  'scholarshipId',
] as const;

const REVIEWED_HEADERS = [...INPUT_HEADERS, ...REVIEWED_ID_HEADERS];

const ERROR_HEADERS = [...INPUT_HEADERS, 'errorReason'];

/** Legacy CSVs may omit courseKey; it is assigned on import/export. */
const REQUIRED_INPUT_HEADERS = INPUT_HEADERS.filter(
  (h) => h !== 'courseKey',
);

export const CourseImportSchema: CsvImportSchema = {
  inputHeaders: [...INPUT_HEADERS],
  requiredHeaders: [...REQUIRED_INPUT_HEADERS],
  reviewedHeaders: [...REVIEWED_HEADERS],
  errorHeaders: [...ERROR_HEADERS],
};
