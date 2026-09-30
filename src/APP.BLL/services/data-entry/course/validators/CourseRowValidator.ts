import { Injectable } from '@nestjs/common';
import type { CsvRow } from '../../common/abstractions/CsvImportProcessor';
import type { CourseCsvRow, ErrorCourseRow } from '../dto/CourseImportRowTypes';
import { parseIntakeInfoList } from '../parsers/courseIntakeInfoParser';
import {
  parseCourseDurationMonths,
  parseRequiredDecimal,
} from '../parsers/courseCsvFieldParsers';
import {
  formatImportError,
  ImportErrorCode,
} from '../../common/abstractions/ImportErrorCode';
import { parseMetaDataItems } from '../../common/engine/MetaDataParser';
import { validateCourseRowScoreAndCompleteness } from '@shared/validation/courseRowFieldValidation';

export type { CourseCsvRow, ErrorCourseRow };

const REQUIRED = [
  'uniName',
  'programmeName',
  'degreeName',
  'courseName',
  'minDegreeName',
  'minGpa',
  'intakeInfo',
] as const satisfies readonly string[];

@Injectable()
export class CourseRowValidator {
  validateRows(rows: CourseCsvRow[]): {
    valid: CourseCsvRow[];
    invalid: ErrorCourseRow[];
  } {
    const valid: CourseCsvRow[] = [];
    const invalid: ErrorCourseRow[] = [];
    for (const row of rows) {
      const fieldErrors = this.validateRowFieldErrors(row);
      if (Object.keys(fieldErrors).length > 0) {
        const errorReason = formatImportError(
          ImportErrorCode.INVALID_FORMAT,
          Object.entries(fieldErrors)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; '),
        );
        invalid.push({ ...row, errorReason });
      } else {
        valid.push(row);
      }
    }
    return { valid, invalid };
  }

  validateRowFieldErrors(row: CourseCsvRow): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const key of REQUIRED) {
      const v = row[key as keyof CourseCsvRow];
      if (v === undefined || v === null || String(v).trim() === '') {
        errors[key] = 'Required';
      }
    }

    if (!errors.minGpa && parseRequiredDecimal(row.minGpa) === null) {
      errors.minGpa = 'Must be a number';
    }

    const scoreErrors = validateCourseRowScoreAndCompleteness(row);
    for (const [k, v] of Object.entries(scoreErrors)) {
      if (!errors[k]) errors[k] = v;
    }

    const higherDeg = (row.higherDegreeName ?? '').trim();
    const higherGpaRaw = (row.higherGpa ?? '').trim();
    if (higherDeg && higherGpaRaw === '') {
      errors.higherGpa = 'Required when higher degree is set';
    }
    if (!higherDeg && higherGpaRaw !== '') {
      errors.higherDegreeName = 'Required when higher GPA is set';
    }
    if (
      higherDeg &&
      higherGpaRaw &&
      !errors.higherGpa &&
      parseRequiredDecimal(row.higherGpa) === null
    ) {
      errors.higherGpa = 'Must be a number';
    }

    if (!errors.intakeInfo) {
      const intakes = parseIntakeInfoList(row.intakeInfo);
      if (intakes.length === 0) {
        errors.intakeInfo =
          'Must be parseable (e.g. Sep-26, September 2026, or September 2026, January 2027)';
      }
    }

    const durRaw = (row.courseDuration ?? '').trim();
    if (durRaw && parseCourseDurationMonths(row.courseDuration) === null) {
      errors.courseDuration = 'Must contain a number (months)';
    }

    const ar = (row.AcademicRequirementsMetaData ?? '').trim();
    if (ar && !parseMetaDataItems(ar)) {
      errors.AcademicRequirementsMetaData = 'Must be valid MetaDataItem[] JSON';
    }
    const fm = (row.feesMetaData ?? '').trim();
    if (fm && !parseMetaDataItems(fm)) {
      errors.feesMetaData = 'Must be valid MetaDataItem[] JSON';
    }
    const sm = (row.scholarshipMetaData ?? '').trim();
    if (sm && !parseMetaDataItems(sm)) {
      errors.scholarshipMetaData = 'Must be valid MetaDataItem[] JSON';
    }

    const engCols = [
      'ieltsMinOverall',
      'ieltsMinSection',
      'toeflMinOverall',
      'toeflMinSection',
      'pteMinOverall',
      'pteMinSection',
    ] as const;
    for (const c of engCols) {
      const x = (row[c] ?? '').trim();
      if (x !== '' && parseRequiredDecimal(x) === null) {
        errors[c] = 'Must be a number when set';
      }
    }

    const feeCols = [
      'tuitionFee',
      'initialDeposit',
      'applicationFee',
      'scholarshipAmount',
      'commission',
    ] as const;
    for (const c of feeCols) {
      const x = (row[c] ?? '').trim();
      if (x !== '' && parseRequiredDecimal(x) === null) {
        errors[c] = 'Must be a number when set';
      }
    }

    return errors;
  }
}
