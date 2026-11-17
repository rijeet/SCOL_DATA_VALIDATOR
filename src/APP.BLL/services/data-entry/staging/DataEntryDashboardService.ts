import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { CourseEngReq } from '@entity/entities/CourseEngReq.entity';
import { CourseIntakeScholarships } from '@entity/entities/CourseIntakeScholarships.entity';
import { DataEntryDashboardSnapshots } from '@entity/entities/DataEntryDashboardSnapshots.entity';
import { SysAcademicDegrees } from '@entity/entities/SysAcademicDegrees.entity';
import { SysCities } from '@entity/entities/SysCities.entity';
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { SysEnglishTests } from '@entity/entities/SysEnglishTests.entity';
import { SysStates } from '@entity/entities/SysStates.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { UniCourseIntakes } from '@entity/entities/UniCourseIntakes.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import type { RemapDashboardIntakesRequestDto } from '@shared/dtos/data-entry/RemapDashboardIntakesRequestDto';
import type {
  DashboardDegreeItem,
  DashboardEnglishTestItem,
  DashboardGeoItem,
  DashboardScholarshipItem,
  DashboardSnapshotPayload,
  DashboardSnapshotResponse,
  DashboardUniIntakes,
} from '@shared/dtos/data-entry/DashboardSnapshotDto';

export type RemapIntakesResult = {
  updated: number;
  merged: number;
  skipped: number;
};

@Injectable()
export class DataEntryDashboardService {
  constructor(private readonly db: AppDbContext) {}

  async getSnapshot(): Promise<DashboardSnapshotResponse> {
    const row = await this.latestRow();
    return { payload: row?.payload ?? null };
  }

  async refresh(userId: string): Promise<DashboardSnapshotResponse> {
    const payload = await this.buildPayload();
    const existing = await this.latestRow();
    if (existing) {
      existing.payload = payload;
      existing.updatedByUserId = userId;
      await this.db.Set(DataEntryDashboardSnapshots).save(existing);
    } else {
      await this.db.Set(DataEntryDashboardSnapshots).save(
        this.db.Set(DataEntryDashboardSnapshots).create({
          payload,
          updatedByUserId: userId,
        }),
      );
    }
    return { payload };
  }

  async remapIntakes(
    dto: RemapDashboardIntakesRequestDto,
  ): Promise<RemapIntakesResult> {
    if (dto.fromYear === dto.toYear && dto.fromMonth === dto.toMonth) {
      throw new BadRequestException(
        'New intake must differ from the current intake',
      );
    }
    const uni = await this.db.Set(SysUniversities).findOne({
      where: { id: dto.uniId },
    });
    if (!uni) {
      throw new NotFoundException('University not found');
    }

    const fromIntakes = await this.db
      .Set(UniCourseIntakes)
      .createQueryBuilder('i')
      .innerJoin(UniCourses, 'c', 'c.id = i.uniCourseId')
      .where('c.uniId = :uniId', { uniId: dto.uniId })
      .andWhere('i.intakeYear = :year', { year: dto.fromYear })
      .andWhere('i.intakeMonth = :month', { month: dto.fromMonth })
      .andWhere('i.deletedAt IS NULL')
      .andWhere('c.deletedAt IS NULL')
      .andWhere('i.isActive = true')
      .getMany();

    let updated = 0;
    let merged = 0;
    const skipped = 0;

    await this.db.transaction(async (manager) => {
      for (const row of fromIntakes) {
        const existing = await manager
          .createQueryBuilder(UniCourseIntakes, 'i')
          .where('i.uniCourseId = :cid', { cid: row.uniCourseId })
          .andWhere('i.intakeYear = :year', { year: dto.toYear })
          .andWhere('i.intakeMonth = :month', { month: dto.toMonth })
          .andWhere('i.deletedAt IS NULL')
          .getOne();
        if (existing) {
          await manager.softDelete(UniCourseIntakes, row.id);
          merged += 1;
        } else {
          await manager.update(UniCourseIntakes, row.id, {
            intakeYear: dto.toYear,
            intakeMonth: dto.toMonth,
          });
          updated += 1;
        }
      }
    });

    return { updated, merged, skipped };
  }

  private async latestRow(): Promise<DataEntryDashboardSnapshots | null> {
    const rows = await this.db.Set(DataEntryDashboardSnapshots).find({
      order: { updatedAt: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  private async buildPayload(): Promise<DashboardSnapshotPayload> {
    const [
      countries,
      universities,
      courses,
      degrees,
      tests,
      states,
      cities,
      engMins,
      scholarshipRows,
      intakeRows,
    ] = await Promise.all([
      this.db.Set(SysCountries).find({
        select: ['id', 'countryName', 'countryCode'],
        order: { countryName: 'ASC' },
      }),
      this.db.Set(SysUniversities).find({
        select: ['id', 'uniName', 'sysCountryId'],
        order: { uniName: 'ASC' },
      }),
      this.db.Set(UniCourses).find({
        select: ['id', 'uniId', 'sysDegreeId'],
      }),
      this.db.Set(SysAcademicDegrees).find({
        select: ['id', 'degreeName', 'levelOrder'],
        order: { levelOrder: 'ASC' },
      }),
      this.db.Set(SysEnglishTests).find({
        select: ['id', 'testName', 'levelOrder', 'maxScore'],
        order: { levelOrder: 'ASC' },
      }),
      this.db.Set(SysStates).find({
        select: ['id', 'stateName', 'sysCountryId'],
        order: { stateName: 'ASC' },
      }),
      this.db.Set(SysCities).find({
        select: ['id', 'cityName', 'sysStateId'],
        order: { cityName: 'ASC' },
      }),
      this.db
        .Set(CourseEngReq)
        .createQueryBuilder('e')
        .select('e.sysEngTestId', 'testId')
        .addSelect('MIN(e.minOverallReq)', 'minScore')
        .where('e.deletedAt IS NULL')
        .groupBy('e.sysEngTestId')
        .getRawMany<{ testId: string; minScore: string | null }>(),
      this.db
        .Set(CourseIntakeScholarships)
        .createQueryBuilder('s')
        .innerJoin(
          UniCourseIntakes,
          'i',
          'i.id = s.courseIntakeId AND i.deletedAt IS NULL',
        )
        .innerJoin(
          UniCourses,
          'c',
          'c.id = i.uniCourseId AND c.deletedAt IS NULL',
        )
        .innerJoin(
          SysUniversities,
          'u',
          'u.id = c.uniId AND u.deletedAt IS NULL',
        )
        .innerJoin(
          SysAcademicDegrees,
          'd',
          'd.id = c.sysDegreeId AND d.deletedAt IS NULL',
        )
        .select('u.id', 'uniId')
        .addSelect('u.uniName', 'uniName')
        .addSelect('u.sysCountryId', 'countryId')
        .addSelect('d.id', 'degreeId')
        .addSelect('d.degreeName', 'degreeName')
        .addSelect('s.amount', 'amount')
        .addSelect('s.amountType', 'amountType')
        .addSelect('COUNT(DISTINCT c.id)', 'courseCount')
        .where('s.deletedAt IS NULL')
        .andWhere('s.isActive = true')
        .groupBy('u.id')
        .addGroupBy('u.uniName')
        .addGroupBy('u.sysCountryId')
        .addGroupBy('d.id')
        .addGroupBy('d.degreeName')
        .addGroupBy('s.amount')
        .addGroupBy('s.amountType')
        .orderBy('u.uniName', 'ASC')
        .addOrderBy('d.degreeName', 'ASC')
        .getRawMany<{
          uniId: string;
          uniName: string;
          countryId: string;
          degreeId: string;
          degreeName: string;
          amount: string | null;
          amountType: string | null;
          courseCount: string;
        }>(),
      this.db
        .Set(UniCourseIntakes)
        .createQueryBuilder('i')
        .innerJoin(
          UniCourses,
          'c',
          'c.id = i.uniCourseId AND c.deletedAt IS NULL',
        )
        .innerJoin(
          SysUniversities,
          'u',
          'u.id = c.uniId AND u.deletedAt IS NULL',
        )
        .select('u.id', 'uniId')
        .addSelect('u.uniName', 'uniName')
        .addSelect('u.sysCountryId', 'countryId')
        .addSelect('i.intakeYear', 'year')
        .addSelect('i.intakeMonth', 'month')
        .addSelect('i.intakeKey', 'intakeKey')
        .addSelect('COUNT(DISTINCT c.id)', 'courseCount')
        .where('i.deletedAt IS NULL')
        .andWhere('i.isActive = true')
        .groupBy('u.id')
        .addGroupBy('u.uniName')
        .addGroupBy('u.sysCountryId')
        .addGroupBy('i.intakeYear')
        .addGroupBy('i.intakeMonth')
        .addGroupBy('i.intakeKey')
        .orderBy('u.uniName', 'ASC')
        .addOrderBy('i.intakeKey', 'ASC')
        .getRawMany<{
          uniId: string;
          uniName: string;
          countryId: string;
          year: string;
          month: string;
          intakeKey: string;
          courseCount: string;
        }>(),
    ]);

    const courseCountByUni = new Map<string, number>();
    const uniCountry = new Map<string, string>();
    for (const uni of universities) {
      uniCountry.set(uni.id, uni.sysCountryId);
    }
    const degreeTotals = new Map<string, number>();
    const degreeByCountry = new Map<string, Record<string, number>>();
    for (const course of courses) {
      courseCountByUni.set(
        course.uniId,
        (courseCountByUni.get(course.uniId) ?? 0) + 1,
      );
      degreeTotals.set(
        course.sysDegreeId,
        (degreeTotals.get(course.sysDegreeId) ?? 0) + 1,
      );
      const countryId = uniCountry.get(course.uniId);
      if (countryId) {
        const rec = degreeByCountry.get(course.sysDegreeId) ?? {};
        rec[countryId] = (rec[countryId] ?? 0) + 1;
        degreeByCountry.set(course.sysDegreeId, rec);
      }
    }

    const unisByCountry = new Map<string, SysUniversities[]>();
    for (const uni of universities) {
      const list = unisByCountry.get(uni.sysCountryId) ?? [];
      list.push(uni);
      unisByCountry.set(uni.sysCountryId, list);
    }

    const byCountry = countries
      .filter((country) => (unisByCountry.get(country.id) ?? []).length > 0)
      .map((country) => {
        const countryUnis = unisByCountry.get(country.id) ?? [];
        const uniRows = countryUnis.map((uni) => ({
          id: uni.id,
          name: uni.uniName,
          courseCount: courseCountByUni.get(uni.id) ?? 0,
        }));
        return {
          id: country.id,
          name: country.countryName,
          code: country.countryCode ?? null,
          universityCount: uniRows.length,
          courseCount: uniRows.reduce((sum, u) => sum + u.courseCount, 0),
          universities: uniRows,
        };
      });

    const statesByCountryId: Record<string, DashboardGeoItem[]> = {};
    for (const state of states) {
      const list = statesByCountryId[state.sysCountryId] ?? [];
      list.push({ id: state.id, name: state.stateName });
      statesByCountryId[state.sysCountryId] = list;
    }

    const citiesByStateId: Record<string, DashboardGeoItem[]> = {};
    for (const city of cities) {
      const list = citiesByStateId[city.sysStateId] ?? [];
      list.push({ id: city.id, name: city.cityName });
      citiesByStateId[city.sysStateId] = list;
    }

    const degreeItems: DashboardDegreeItem[] = degrees.map((d) => ({
      id: d.id,
      name: d.degreeName,
      levelOrder: d.levelOrder,
      courseCount: degreeTotals.get(d.id) ?? 0,
      courseCountByCountryId: degreeByCountry.get(d.id) ?? {},
    }));

    const minByTest = new Map(
      engMins.map((r) => [r.testId, toNumber(r.minScore)]),
    );
    const englishTests: DashboardEnglishTestItem[] = tests.map((t) => ({
      id: t.id,
      name: t.testName,
      minScore: minByTest.get(t.id) ?? null,
      maxScore: toNumber(t.maxScore ?? null),
    }));

    const scholarships: DashboardScholarshipItem[] = scholarshipRows.map(
      (r) => ({
        uniId: r.uniId,
        uniName: r.uniName,
        countryId: r.countryId,
        degreeId: r.degreeId,
        degreeName: r.degreeName,
        amount: r.amount,
        amountType: r.amountType,
        courseCount: Number(r.courseCount) || 0,
      }),
    );

    const intakesByUniMap = new Map<string, DashboardUniIntakes>();
    for (const r of intakeRows) {
      let uni = intakesByUniMap.get(r.uniId);
      if (!uni) {
        uni = {
          uniId: r.uniId,
          uniName: r.uniName,
          countryId: r.countryId,
          intakes: [],
        };
        intakesByUniMap.set(r.uniId, uni);
      }
      uni.intakes.push({
        year: Number(r.year),
        month: Number(r.month),
        intakeKey: Number(r.intakeKey),
        courseCount: Number(r.courseCount) || 0,
      });
    }

    return {
      updatedAt: new Date().toISOString(),
      totals: {
        countries: byCountry.length,
        universities: universities.length,
        courses: courses.length,
      },
      byCountry,
      degrees: degreeItems,
      englishTests,
      scholarships,
      intakesByUni: [...intakesByUniMap.values()],
      geo: {
        countries: countries
          .filter(
            (c) =>
              (unisByCountry.get(c.id) ?? []).length > 0 ||
              (statesByCountryId[c.id] ?? []).length > 0,
          )
          .map((c) => ({
            id: c.id,
            name: c.countryName,
          })),
        statesByCountryId,
        citiesByStateId,
      },
    };
  }
}

function toNumber(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
