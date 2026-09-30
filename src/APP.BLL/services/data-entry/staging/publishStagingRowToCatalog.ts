import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { UniCourseIntakes } from '@entity/entities/UniCourseIntakes.entity';
import { CourseIntakeScholarships } from '@entity/entities/CourseIntakeScholarships.entity';
import { CourseEngReq } from '@entity/entities/CourseEngReq.entity';
import { parseIntakeInfoList } from '../course/parsers/courseIntakeInfoParser';
import {
  parseCourseDurationMonths,
  parseOptionalDate,
  parseOptionalDecimal,
} from '../course/parsers/courseCsvFieldParsers';
import { parseMetaDataItems } from '../common/engine/MetaDataParser';
import type { DataEntryCatalogLookup } from './DataEntryCatalogLookup';

const ENGLISH_COLUMNS = [
  { test: 'IELTS', overall: 'ieltsMinOverall', section: 'ieltsMinSection' },
  { test: 'TOEFL', overall: 'toeflMinOverall', section: 'toeflMinSection' },
  { test: 'PTE', overall: 'pteMinOverall', section: 'pteMinSection' },
] as const;

export type PublishRowStats = {
  courses: number;
  intakes: number;
  scholarships: number;
  engReqs: number;
};

export async function publishStagingRowToCatalog(
  manager: EntityManager,
  lookup: DataEntryCatalogLookup,
  uniId: string,
  fields: Record<string, string>,
): Promise<PublishRowStats> {
  const stats: PublishRowStats = {
    courses: 0,
    intakes: 0,
    scholarships: 0,
    engReqs: 0,
  };

  const programmeId = await lookup.programme(fields.programmeName ?? '');
  const degreeId = await lookup.degree(fields.degreeName ?? '');
  const minDegreeId = await lookup.degree(fields.minDegreeName ?? '');
  const higherName = (fields.higherDegreeName ?? '').trim();
  const higherDegreeId = higherName
    ? await lookup.degree(higherName)
    : undefined;

  const intakes = parseIntakeInfoList(fields.intakeInfo ?? '');
  if (intakes.length === 0) {
    throw new BadRequestException(
      `intakeInfo could not be parsed for course "${fields.courseName ?? ''}"`,
    );
  }

  const course = await manager.save(
    UniCourses,
    manager.create(UniCourses, {
      uniId,
      sysProgrammeId: programmeId,
      sysDegreeId: degreeId,
      courseName: (fields.courseName ?? '').trim(),
      minSysDegreeId: minDegreeId,
      minGpa: parseOptionalDecimal(fields.minGpa ?? ''),
      higherSysDegreeId: higherDegreeId,
      higherGpa: parseOptionalDecimal(fields.higherGpa ?? ''),
      requirementMetaData:
        parseMetaDataItems(fields.AcademicRequirementsMetaData ?? '') ??
        undefined,
      externalUrl: (fields.courseUrlExternal ?? '').trim() || undefined,
    }),
  );
  stats.courses = 1;

  const duration = parseCourseDurationMonths(fields.courseDuration ?? '');
  const deadline = parseOptionalDate(fields.applicationDeadline ?? '');
  const scholarshipName = (fields.scholarshipName ?? '').trim();

  for (const intake of intakes) {
    const intakeEntity = await manager.save(
      UniCourseIntakes,
      manager.create(UniCourseIntakes, {
        uniCourseId: course.id,
        intakeMonth: intake.month,
        intakeYear: intake.year,
        courseDuration: duration ?? undefined,
        applicationDeadline: deadline,
        tuitionFee: parseOptionalDecimal(fields.tuitionFee ?? ''),
        currency: (fields.currency ?? '').trim() || undefined,
        initialDeposit: parseOptionalDecimal(fields.initialDeposit ?? ''),
        applicationFee: parseOptionalDecimal(fields.applicationFee ?? ''),
        feesMetaData:
          parseMetaDataItems(fields.feesMetaData ?? '') ?? undefined,
        scholarshipMetaData:
          parseMetaDataItems(fields.scholarshipMetaData ?? '') ?? undefined,
        isActive: true,
      }),
    );
    stats.intakes += 1;

    if (scholarshipName) {
      await manager.save(
        CourseIntakeScholarships,
        manager.create(CourseIntakeScholarships, {
          courseIntakeId: intakeEntity.id,
          name: scholarshipName,
          amount: parseOptionalDecimal(fields.scholarshipAmount ?? ''),
          amountType: (fields.scholarshipType ?? '').trim() || undefined,
          isActive: true,
        }),
      );
      stats.scholarships += 1;
    }
  }

  for (const col of ENGLISH_COLUMNS) {
    const overall = parseOptionalDecimal(fields[col.overall] ?? '');
    const section = parseOptionalDecimal(fields[col.section] ?? '');
    if (!overall && !section) continue;
    const testId = await lookup.englishTest(col.test);
    await manager.save(
      CourseEngReq,
      manager.create(CourseEngReq, {
        uniCourseId: course.id,
        sysEngTestId: testId,
        minOverallReq: overall,
        minSectionReq: section,
      }),
    );
    stats.engReqs += 1;
  }

  return stats;
}
