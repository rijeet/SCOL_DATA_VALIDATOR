import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { CourseEngReq } from '@entity/entities/CourseEngReq.entity';
import { CourseIntakeScholarships } from '@entity/entities/CourseIntakeScholarships.entity';
import { DataEntryBatches } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { DataEntryDashboardSnapshots } from '@entity/entities/DataEntryDashboardSnapshots.entity';
import { SysAcademicDegrees } from '@entity/entities/SysAcademicDegrees.entity';
import { SysCities } from '@entity/entities/SysCities.entity';
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { SysEnglishTests } from '@entity/entities/SysEnglishTests.entity';
import { SysProgrammes } from '@entity/entities/SysProgrammes.entity';
import { SysStates } from '@entity/entities/SysStates.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { UniAcademicReq } from '@entity/entities/UniAcademicReq.entity';
import { UniCourseIntakes } from '@entity/entities/UniCourseIntakes.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { formatIntakeInfoList } from '../course/parsers/courseIntakeInfoParser';
import { parseOptionalDecimal } from '../course/parsers/courseCsvFieldParsers';
import { normalizeCommissionType } from '@shared/constants/amountTypes.constants';
import type { RemapDashboardEntryDegreesRequestDto } from '@shared/dtos/data-entry/RemapDashboardEntryDegreesRequestDto';
import type { RemapDashboardIntakesRequestDto } from '@shared/dtos/data-entry/RemapDashboardIntakesRequestDto';
import type { RemapDashboardScholarshipsRequestDto } from '@shared/dtos/data-entry/RemapDashboardScholarshipsRequestDto';
import type { RenameDashboardProgrammeRequestDto } from '@shared/dtos/data-entry/RenameDashboardProgrammeRequestDto';
import type {
  DashboardDegreeCourseList,
  DashboardDegreeItem,
  DashboardEnglishTestItem,
  DashboardEntryDegreeGroup,
  DashboardGeoItem,
  DashboardProgrammeItem,
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

  async listCoursesForDegree(
    degreeId: string,
    countryId?: string,
  ): Promise<DashboardDegreeCourseList> {
    const degree = await this.db.Set(SysAcademicDegrees).findOne({
      where: { id: degreeId },
    });
    if (!degree) {
      throw new NotFoundException('Degree not found');
    }

    const qb = this.db
      .Set(UniCourses)
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.SysUniversity', 'u')
      .leftJoinAndSelect('c.SysProgramme', 'p')
      .where('c.deletedAt IS NULL')
      .andWhere('c.sysDegreeId = :degreeId', { degreeId })
      .andWhere('u.deletedAt IS NULL')
      .orderBy('u.uniName', 'ASC')
      .addOrderBy('c.courseName', 'ASC');

    const filterCountryId = emptyId(countryId);
    if (filterCountryId) {
      qb.andWhere('u.sysCountryId = :countryId', {
        countryId: filterCountryId,
      });
    }

    const catalog = await qb.getMany();

    type StagingHit = {
      batchId: string;
      universityKey: string;
      rowCount: number;
      rowIndex: number;
    };
    const uniNames = new Map<string, string>();
    for (const row of catalog) {
      uniNames.set(row.uniId, row.SysUniversity.uniName);
    }

    const hitsByUni = new Map<string, Map<string, StagingHit>>();
    await Promise.all(
      [...uniNames.entries()].map(async ([uniId, uniName]) => {
        const batches = await this.courseBatchesForUni(this.db.manager, uniId);
        const hits = new Map<string, StagingHit>();
        for (const batch of batches) {
          const staging = await this.db.Set(DataEntryCourseRows).find({
            where: { batchId: batch.id },
            select: ['rowIndex', 'fields'],
          });
          for (const s of staging) {
            const fields = s.fields ?? {};
            const key = courseKey(
              fields.courseName ?? '',
              fields.degreeName ?? '',
            );
            if (hits.has(key)) continue;
            hits.set(key, {
              batchId: batch.id,
              universityKey: batch.universityKey || uniName,
              rowCount: batch.rowCount,
              rowIndex: s.rowIndex,
            });
          }
        }
        hitsByUni.set(uniId, hits);
      }),
    );

    return {
      degreeId: degree.id,
      degreeName: degree.degreeName,
      courses: catalog.map((row) => {
        const uniName = row.SysUniversity.uniName;
        const hit = matchStagingHit(
          hitsByUni.get(row.uniId) ?? new Map(),
          row.courseName,
          degree.degreeName,
        );
        return {
          uniId: row.uniId,
          uniName,
          courseName: row.courseName,
          programmeName: row.SysProgramme?.name ?? null,
          universityKey: hit?.universityKey || uniName,
          batchId: hit?.batchId ?? null,
          rowIndex: hit?.rowIndex ?? null,
          rowCount: hit?.rowCount ?? null,
        };
      }),
    };
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
    let skipped = 0;

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
      skipped += await this.syncStagingIntakes(manager, dto.uniId);
    });

    return { updated, merged, skipped };
  }

  async remapEntryDegrees(
    dto: RemapDashboardEntryDegreesRequestDto,
  ): Promise<RemapIntakesResult> {
    const fromHigh = emptyId(dto.fromHighDegreeId);
    const toHigh = emptyId(dto.toHighDegreeId);
    if (dto.fromMinDegreeId === dto.toMinDegreeId && fromHigh === toHigh) {
      throw new BadRequestException(
        'New min/high degree must differ from the current pair',
      );
    }
    const uni = await this.db.Set(SysUniversities).findOne({
      where: { id: dto.uniId },
    });
    if (!uni) {
      throw new NotFoundException('University not found');
    }
    const toMin = await this.db.Set(SysAcademicDegrees).findOne({
      where: { id: dto.toMinDegreeId },
    });
    if (!toMin) {
      throw new NotFoundException('Minimum degree not found');
    }
    let toHighName: string | null = null;
    if (toHigh) {
      const high = await this.db.Set(SysAcademicDegrees).findOne({
        where: { id: toHigh },
      });
      if (!high) {
        throw new NotFoundException('High degree not found');
      }
      toHighName = high.degreeName;
    }

    let updated = 0;
    let skipped = 0;
    await this.db.transaction(async (manager) => {
      const qb = manager
        .createQueryBuilder(UniCourses, 'c')
        .where('c.uniId = :uniId', { uniId: dto.uniId })
        .andWhere('c.minSysDegreeId = :minId', { minId: dto.fromMinDegreeId })
        .andWhere('c.deletedAt IS NULL');
      if (fromHigh) {
        qb.andWhere('c.higherSysDegreeId = :highId', { highId: fromHigh });
      } else {
        qb.andWhere('c.higherSysDegreeId IS NULL');
      }
      const courses = await qb.getMany();
      const degreeNames = await this.degreeNameMap(manager);
      const keys = new Set(
        courses.map((c) =>
          courseKey(c.courseName, degreeNames.get(c.sysDegreeId) ?? ''),
        ),
      );
      for (const course of courses) {
        await manager
          .createQueryBuilder()
          .update(UniCourses)
          .set({
            minSysDegreeId: dto.toMinDegreeId,
            higherSysDegreeId: toHigh,
          })
          .where('id = :id', { id: course.id })
          .execute();
        updated += 1;
      }
      await this.rebuildUniAcademicReq(manager, dto.uniId);
      skipped += await this.patchStagingRows(
        manager,
        dto.uniId,
        (fields, key) => {
          if (!keys.has(key)) return null;
          return {
            ...fields,
            minDegreeName: toMin.degreeName,
            higherDegreeName: toHighName ?? '',
          };
        },
      );
    });

    return { updated, merged: 0, skipped };
  }

  async renameProgramme(
    dto: RenameDashboardProgrammeRequestDto,
  ): Promise<RemapIntakesResult> {
    const newName = dto.newName.trim();
    if (!newName) {
      throw new BadRequestException('Programme name is required');
    }
    const programme = await this.db.Set(SysProgrammes).findOne({
      where: { id: dto.programmeId },
    });
    if (!programme) {
      throw new NotFoundException('Programme not found');
    }
    if (programme.name.trim().toLowerCase() === newName.toLowerCase()) {
      throw new BadRequestException('New name must differ from the current name');
    }

    let updated = 0;
    let merged = 0;
    let skipped = 0;
    await this.db.transaction(async (manager) => {
      const clash = await manager
        .createQueryBuilder(SysProgrammes, 'p')
        .where('LOWER(TRIM(p.name)) = LOWER(TRIM(:name))', { name: newName })
        .andWhere('p.id != :id', { id: dto.programmeId })
        .andWhere('p.deletedAt IS NULL')
        .getOne();

      let survivingId = dto.programmeId;
      if (clash) {
        survivingId = clash.id;
        await manager
          .createQueryBuilder()
          .update(UniCourses)
          .set({ sysProgrammeId: clash.id })
          .where('sysProgrammeId = :id', { id: dto.programmeId })
          .andWhere('deletedAt IS NULL')
          .execute();
        await manager.softDelete(SysProgrammes, dto.programmeId);
        merged = 1;
      } else {
        await manager.update(SysProgrammes, dto.programmeId, { name: newName });
      }

      const uniRows = await manager
        .createQueryBuilder(UniCourses, 'c')
        .select('c.uniId', 'uniId')
        .addSelect('COUNT(c.id)', 'n')
        .where('c.sysProgrammeId = :id', { id: survivingId })
        .andWhere('c.deletedAt IS NULL')
        .groupBy('c.uniId')
        .getRawMany<{ uniId: string; n: string }>();
      updated = uniRows.reduce((sum, r) => sum + (Number(r.n) || 0), 0);

      const degreeNames = await this.degreeNameMap(manager);
      const catalogCourses = await manager.find(UniCourses, {
        where: { sysProgrammeId: survivingId },
        select: ['uniId', 'courseName', 'sysDegreeId'],
      });
      const keysByUni = new Map<string, Set<string>>();
      for (const c of catalogCourses) {
        const set = keysByUni.get(c.uniId) ?? new Set<string>();
        set.add(courseKey(c.courseName, degreeNames.get(c.sysDegreeId) ?? ''));
        keysByUni.set(c.uniId, set);
      }
      for (const row of uniRows) {
        const keys = keysByUni.get(row.uniId) ?? new Set<string>();
        skipped += await this.patchStagingRows(
          manager,
          row.uniId,
          (fields, key) => {
            if (!keys.has(key)) return null;
            return { ...fields, programmeName: newName };
          },
        );
      }
    });

    return { updated, merged, skipped };
  }

  async remapScholarships(
    dto: RemapDashboardScholarshipsRequestDto,
  ): Promise<RemapIntakesResult> {
    const uni = await this.db.Set(SysUniversities).findOne({
      where: { id: dto.uniId },
    });
    if (!uni) {
      throw new NotFoundException('University not found');
    }
    const degree = await this.db.Set(SysAcademicDegrees).findOne({
      where: { id: dto.degreeId },
    });
    if (!degree) {
      throw new NotFoundException('Degree not found');
    }

    const toName = dto.toName.trim();
    const toAmount = parseOptionalDecimal(dto.toAmount ?? '');
    const toType = normalizeCommissionType(dto.toAmountType);
    if (!toName) {
      throw new BadRequestException('Scholarship name is required');
    }
    if (!toAmount) {
      throw new BadRequestException('Scholarship amount is required');
    }
    if (!toType) {
      throw new BadRequestException(
        'Scholarship type must be Amount or Percentage',
      );
    }

    const fromName = emptyId(dto.fromName);
    const fromAmount = emptyId(dto.fromAmount);
    const fromType = normalizeCommissionType(dto.fromAmountType ?? '');

    if (
      (fromName ?? '') === toName &&
      scholarshipAmountKey(fromAmount) === scholarshipAmountKey(toAmount) &&
      (fromType ?? '') === toType
    ) {
      throw new BadRequestException(
        'New scholarship must differ from the current scholarship',
      );
    }

    let updated = 0;
    let skipped = 0;
    await this.db.transaction(async (manager) => {
      const degreeNames = await this.degreeNameMap(manager);
      const keys = new Set<string>();

      if (!fromName) {
        const courses = await manager
          .createQueryBuilder(UniCourses, 'c')
          .innerJoin(
            UniCourseIntakes,
            'i',
            'i.uniCourseId = c.id AND i.deletedAt IS NULL AND i.isActive = true',
          )
          .where('c.uniId = :uniId', { uniId: dto.uniId })
          .andWhere('c.sysDegreeId = :degreeId', { degreeId: dto.degreeId })
          .andWhere('c.deletedAt IS NULL')
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM "CourseIntakeScholarships" s
              INNER JOIN "UniCourseIntakes" si
                ON si.id = s."courseIntakeId" AND si."deletedAt" IS NULL
              WHERE si."uniCourseId" = c.id
                AND s."deletedAt" IS NULL
                AND s."isActive" = true
            )`,
          )
          .select('c.id', 'id')
          .addSelect('c.courseName', 'courseName')
          .addSelect('c.sysDegreeId', 'sysDegreeId')
          .groupBy('c.id')
          .addGroupBy('c.courseName')
          .addGroupBy('c.sysDegreeId')
          .getRawMany<{
            id: string;
            courseName: string;
            sysDegreeId: string;
          }>();

        for (const course of courses) {
          const intakes = await manager
            .createQueryBuilder(UniCourseIntakes, 'i')
            .where('i.uniCourseId = :courseId', { courseId: course.id })
            .andWhere('i.deletedAt IS NULL')
            .andWhere('i.isActive = true')
            .getMany();
          for (const intake of intakes) {
            await manager.save(
              CourseIntakeScholarships,
              manager.create(CourseIntakeScholarships, {
                courseIntakeId: intake.id,
                name: toName,
                amount: toAmount,
                amountType: toType,
                isActive: true,
              }),
            );
            updated += 1;
          }
          keys.add(
            courseKey(
              course.courseName,
              degreeNames.get(course.sysDegreeId) ?? '',
            ),
          );
        }
      } else {
        const qb = manager
          .createQueryBuilder(CourseIntakeScholarships, 's')
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
          .where('c.uniId = :uniId', { uniId: dto.uniId })
          .andWhere('c.sysDegreeId = :degreeId', { degreeId: dto.degreeId })
          .andWhere('s.deletedAt IS NULL')
          .andWhere('s.isActive = true')
          .andWhere('LOWER(TRIM(s.name)) = LOWER(TRIM(:fromName))', {
            fromName,
          });
        if (fromAmount) {
          qb.andWhere(
            's.amount IS NOT NULL AND CAST(s.amount AS numeric) = CAST(:amt AS numeric)',
            { amt: fromAmount },
          );
        } else {
          qb.andWhere('s.amount IS NULL');
        }
        if (fromType) {
          qb.andWhere('UPPER(TRIM(s.amountType)) = :fromType', {
            fromType,
          });
        } else {
          qb.andWhere(`(s.amountType IS NULL OR TRIM(s.amountType) = '')`);
        }

        const rows = await qb
          .select('s.id', 'id')
          .addSelect('c.courseName', 'courseName')
          .addSelect('c.sysDegreeId', 'sysDegreeId')
          .getRawMany<{
            id: string;
            courseName: string;
            sysDegreeId: string;
          }>();

        const ids = [...new Set(rows.map((r) => r.id))];
        if (ids.length > 0) {
          await manager
            .createQueryBuilder()
            .update(CourseIntakeScholarships)
            .set({
              name: toName,
              amount: toAmount,
              amountType: toType,
            })
            .where('id IN (:...ids)', { ids })
            .execute();
          updated = ids.length;
        }
        for (const row of rows) {
          keys.add(
            courseKey(row.courseName, degreeNames.get(row.sysDegreeId) ?? ''),
          );
        }
      }

      skipped += await this.patchStagingRows(
        manager,
        dto.uniId,
        (fields, key) => {
          if (!keys.has(key)) return null;
          if (fromName) {
            if (
              (fields.scholarshipName ?? '').trim().toLowerCase() !==
                fromName.toLowerCase() ||
              scholarshipAmountKey(fields.scholarshipAmount) !==
                scholarshipAmountKey(fromAmount) ||
              (normalizeCommissionType(fields.scholarshipType) ?? '') !==
                (fromType ?? '')
            ) {
              return null;
            }
          } else if ((fields.scholarshipName ?? '').trim()) {
            return null;
          }
          return {
            ...fields,
            scholarshipName: toName,
            scholarshipAmount: toAmount,
            scholarshipType: toType,
          };
        },
      );
    });

    return { updated, merged: 0, skipped };
  }

  private async rebuildUniAcademicReq(
    manager: EntityManager,
    uniId: string,
  ): Promise<void> {
    await manager.delete(UniAcademicReq, { uniId });
    const courses = await manager.find(UniCourses, {
      where: { uniId },
      select: ['minSysDegreeId', 'minGpa'],
    });
    const byDegree = new Map<string, string | undefined>();
    for (const course of courses) {
      if (!course.minSysDegreeId) continue;
      const existing = byDegree.get(course.minSysDegreeId);
      byDegree.set(
        course.minSysDegreeId,
        pickStricterDecimal(existing, course.minGpa),
      );
    }
    for (const [sysDegreeId, minGpa] of byDegree) {
      await manager.save(
        UniAcademicReq,
        manager.create(UniAcademicReq, { uniId, sysDegreeId, minGpa }),
      );
    }
  }

  private async syncStagingIntakes(
    manager: EntityManager,
    uniId: string,
  ): Promise<number> {
    const degreeNames = await this.degreeNameMap(manager);
    const courses = await manager.find(UniCourses, {
      where: { uniId },
      select: ['id', 'courseName', 'sysDegreeId'],
    });
    const intakes = await manager
      .createQueryBuilder(UniCourseIntakes, 'i')
      .innerJoin(UniCourses, 'c', 'c.id = i.uniCourseId')
      .where('c.uniId = :uniId', { uniId })
      .andWhere('i.isActive = true')
      .andWhere('i.deletedAt IS NULL')
      .andWhere('c.deletedAt IS NULL')
      .select('i.uniCourseId', 'uniCourseId')
      .addSelect('i.intakeYear', 'intakeYear')
      .addSelect('i.intakeMonth', 'intakeMonth')
      .getRawMany<{
        uniCourseId: string;
        intakeYear: string;
        intakeMonth: string;
      }>();
    const byCourse = new Map<string, { month: number; year: number }[]>();
    for (const row of intakes) {
      const list = byCourse.get(row.uniCourseId) ?? [];
      list.push({
        month: Number(row.intakeMonth),
        year: Number(row.intakeYear),
      });
      byCourse.set(row.uniCourseId, list);
    }
    const infoByKey = new Map<string, string>();
    for (const course of courses) {
      const formatted = formatIntakeInfoList(byCourse.get(course.id) ?? []);
      if (!formatted) continue;
      infoByKey.set(
        courseKey(course.courseName, degreeNames.get(course.sysDegreeId) ?? ''),
        formatted,
      );
    }
    return this.patchStagingRows(manager, uniId, (fields, key) => {
      const intakeInfo = infoByKey.get(key);
      if (!intakeInfo) return null;
      return { ...fields, intakeInfo };
    });
  }

  private async patchStagingRows(
    manager: EntityManager,
    uniId: string,
    patch: (
      fields: Record<string, string>,
      key: string,
    ) => Record<string, string> | null,
  ): Promise<number> {
    const batch = await this.latestCourseBatch(manager, uniId);
    if (!batch) return 0;
    const rows = await manager.find(DataEntryCourseRows, {
      where: { batchId: batch.id },
    });
    let skipped = 0;
    for (const row of rows) {
      const key = courseKey(
        row.fields.courseName ?? '',
        row.fields.degreeName ?? '',
      );
      const next = patch(row.fields, key);
      if (!next) {
        skipped += 1;
        continue;
      }
      row.fields = next;
      await manager.save(DataEntryCourseRows, row);
    }
    return skipped;
  }

  private async courseBatchesForUni(
    manager: EntityManager,
    uniId: string,
  ): Promise<DataEntryBatches[]> {
    const uni = await manager.findOne(SysUniversities, { where: { id: uniId } });
    return manager
      .createQueryBuilder(DataEntryBatches, 'b')
      .where('b.batchType = :type', { type: DataEntryBatchType.COURSE })
      .andWhere('b.deletedAt IS NULL')
      .andWhere(
        '(b.sysUniversityId = :uniId OR b.universityKey = :key)',
        { uniId, key: uni?.uniName ?? '' },
      )
      .orderBy('b.createdAt', 'DESC')
      .getMany();
  }

  private async latestCourseBatch(
    manager: EntityManager,
    uniId: string,
  ): Promise<DataEntryBatches | null> {
    const batches = await this.courseBatchesForUni(manager, uniId);
    return batches[0] ?? null;
  }

  private async degreeNameMap(
    manager: EntityManager,
  ): Promise<Map<string, string>> {
    const degrees = await manager.find(SysAcademicDegrees, {
      select: ['id', 'degreeName'],
    });
    return new Map(degrees.map((d) => [d.id, d.degreeName]));
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
      noneScholarshipRows,
      intakeRows,
      programmeRows,
      entryDegreeRows,
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
        .addSelect('s.name', 'name')
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
        .addGroupBy('s.name')
        .addGroupBy('s.amount')
        .addGroupBy('s.amountType')
        .orderBy('u.uniName', 'ASC')
        .addOrderBy('d.degreeName', 'ASC')
        .addOrderBy('s.name', 'ASC')
        .getRawMany<{
          uniId: string;
          uniName: string;
          countryId: string;
          degreeId: string;
          degreeName: string;
          name: string | null;
          amount: string | null;
          amountType: string | null;
          courseCount: string;
        }>(),
      this.db
        .Set(UniCourses)
        .createQueryBuilder('c')
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
        .addSelect('COUNT(DISTINCT c.id)', 'courseCount')
        .where('c.deletedAt IS NULL')
        .andWhere(
          `EXISTS (
            SELECT 1 FROM "UniCourseIntakes" i
            WHERE i."uniCourseId" = c.id
              AND i."deletedAt" IS NULL
              AND i."isActive" = true
          )`,
        )
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM "CourseIntakeScholarships" s
            INNER JOIN "UniCourseIntakes" i
              ON i.id = s."courseIntakeId" AND i."deletedAt" IS NULL
            WHERE i."uniCourseId" = c.id
              AND s."deletedAt" IS NULL
              AND s."isActive" = true
          )`,
        )
        .groupBy('u.id')
        .addGroupBy('u.uniName')
        .addGroupBy('u.sysCountryId')
        .addGroupBy('d.id')
        .addGroupBy('d.degreeName')
        .orderBy('u.uniName', 'ASC')
        .addOrderBy('d.degreeName', 'ASC')
        .getRawMany<{
          uniId: string;
          uniName: string;
          countryId: string;
          degreeId: string;
          degreeName: string;
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
      this.db
        .Set(UniCourses)
        .createQueryBuilder('c')
        .innerJoin(
          SysProgrammes,
          'p',
          'p.id = c.sysProgrammeId AND p.deletedAt IS NULL',
        )
        .select('p.id', 'id')
        .addSelect('p.name', 'name')
        .addSelect('c.uniId', 'uniId')
        .addSelect('COUNT(c.id)', 'courseCount')
        .where('c.deletedAt IS NULL')
        .groupBy('p.id')
        .addGroupBy('p.name')
        .addGroupBy('c.uniId')
        .orderBy('p.name', 'ASC')
        .getRawMany<{
          id: string;
          name: string;
          uniId: string;
          courseCount: string;
        }>(),
      this.db
        .Set(UniCourses)
        .createQueryBuilder('c')
        .innerJoin(
          SysUniversities,
          'u',
          'u.id = c.uniId AND u.deletedAt IS NULL',
        )
        .leftJoin(
          SysAcademicDegrees,
          'minD',
          'minD.id = c.minSysDegreeId AND minD.deletedAt IS NULL',
        )
        .leftJoin(
          SysAcademicDegrees,
          'highD',
          'highD.id = c.higherSysDegreeId AND highD.deletedAt IS NULL',
        )
        .select('c.uniId', 'uniId')
        .addSelect('u.uniName', 'uniName')
        .addSelect('u.sysCountryId', 'countryId')
        .addSelect('c.minSysDegreeId', 'minDegreeId')
        .addSelect('minD.degreeName', 'minDegreeName')
        .addSelect('MIN(c.minGpa)', 'minGpa')
        .addSelect('c.higherSysDegreeId', 'highDegreeId')
        .addSelect('highD.degreeName', 'highDegreeName')
        .addSelect('MIN(c.higherGpa)', 'highGpa')
        .addSelect('COUNT(c.id)', 'courseCount')
        .where('c.deletedAt IS NULL')
        .andWhere('c.minSysDegreeId IS NOT NULL')
        .groupBy('c.uniId')
        .addGroupBy('u.uniName')
        .addGroupBy('u.sysCountryId')
        .addGroupBy('c.minSysDegreeId')
        .addGroupBy('minD.degreeName')
        .addGroupBy('c.higherSysDegreeId')
        .addGroupBy('highD.degreeName')
        .orderBy('u.uniName', 'ASC')
        .addOrderBy('minD.degreeName', 'ASC')
        .getRawMany<{
          uniId: string;
          uniName: string;
          countryId: string;
          minDegreeId: string;
          minDegreeName: string | null;
          minGpa: string | null;
          highDegreeId: string | null;
          highDegreeName: string | null;
          highGpa: string | null;
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
      levelOrder: d.levelOrder ?? null,
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

    const scholarships: DashboardScholarshipItem[] = [
      ...noneScholarshipRows.map((r) => ({
        uniId: r.uniId,
        uniName: r.uniName,
        countryId: r.countryId,
        degreeId: r.degreeId,
        degreeName: r.degreeName,
        name: null,
        amount: null,
        amountType: null,
        courseCount: Number(r.courseCount) || 0,
      })),
      ...scholarshipRows.map((r) => ({
        uniId: r.uniId,
        uniName: r.uniName,
        countryId: r.countryId,
        degreeId: r.degreeId,
        degreeName: r.degreeName,
        name: r.name ?? null,
        amount: r.amount,
        amountType: r.amountType,
        courseCount: Number(r.courseCount) || 0,
      })),
    ].sort((a, b) => {
      const uni = a.uniName.localeCompare(b.uniName);
      if (uni !== 0) return uni;
      const deg = a.degreeName.localeCompare(b.degreeName);
      if (deg !== 0) return deg;
      if (a.name == null && b.name != null) return -1;
      if (a.name != null && b.name == null) return 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

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

    const programmesById = new Map<string, DashboardProgrammeItem>();
    for (const r of programmeRows) {
      let item = programmesById.get(r.id);
      if (!item) {
        item = {
          id: r.id,
          name: r.name,
          courseCount: 0,
          courseCountByUniId: {},
        };
        programmesById.set(r.id, item);
      }
      const n = Number(r.courseCount) || 0;
      item.courseCount += n;
      item.courseCountByUniId[r.uniId] = n;
    }

    const entryDegreesByUni: DashboardEntryDegreeGroup[] = entryDegreeRows.map(
      (r) => ({
        uniId: r.uniId,
        uniName: r.uniName,
        countryId: r.countryId,
        minDegreeId: r.minDegreeId,
        minDegreeName: r.minDegreeName ?? '—',
        minGpa: r.minGpa,
        highDegreeId: r.highDegreeId,
        highDegreeName: r.highDegreeName,
        highGpa: r.highGpa,
        courseCount: Number(r.courseCount) || 0,
      }),
    );

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
      programmes: [...programmesById.values()],
      entryDegreesByUni,
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

function emptyId(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t || null;
}

function courseKey(courseName: string, degreeName: string): string {
  return `${courseName.trim().toLowerCase()}||${degreeName.trim().toLowerCase()}`;
}

function scholarshipAmountKey(amount: string | null | undefined): string {
  if (amount == null || amount === '') return '';
  const n = Number(amount);
  return Number.isFinite(n) ? String(n) : amount.trim();
}

function matchStagingHit<T>(
  hits: Map<string, T>,
  courseName: string,
  degreeName: string,
): T | null {
  const exact = hits.get(courseKey(courseName, degreeName));
  if (exact) return exact;
  const name = courseName.trim().toLowerCase();
  if (!name) return null;
  let found: T | null = null;
  let count = 0;
  for (const [key, hit] of hits) {
    if (key.split('||')[0] !== name) continue;
    found = hit;
    count += 1;
    if (count > 1) return null;
  }
  return count === 1 ? found : null;
}

function pickStricterDecimal(
  a?: string | null,
  b?: string | null,
): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return Number(a) >= Number(b) ? a : b;
}
