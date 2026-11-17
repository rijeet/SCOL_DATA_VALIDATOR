import { BadRequestException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import {
  DataEntryBatches,
  DataEntryBatchStatus,
} from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { DataEntryUniversityRows } from '@entity/entities/DataEntryUniversityRows.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { DataEntryCatalogLookup } from './DataEntryCatalogLookup';
import { DataEntryGeoLookup } from './DataEntryGeoLookup';
import { publishStagingRowToCatalog } from './publishStagingRowToCatalog';
import { publishUniversityLevelReqs } from './publishUniversityLevelReqs';
import {
  publishUniversityRowToCatalog,
  seedUniApplicationStages,
} from './publishUniversityRowToCatalog';

export type DataEntryPublishReadinessDto = {
  batchId: string;
  batchType: DataEntryBatchType;
  sysUniversityId: string | null;
  sysCountryId: string | null;
  rowCount: number;
  invalidRowCount: number;
  allRowsValid: boolean;
  canPublish: boolean;
  status: DataEntryBatchStatus;
  publishedAt: string | null;
  targetTables: string[];
};

export type DataEntryPublishResultDto = {
  message: string;
  batchType: DataEntryBatchType;
  coursesCreated: number;
  intakesCreated: number;
  scholarshipsCreated: number;
  engReqsCreated: number;
  uniAcademicReqsCreated: number;
  uniEngReqsCreated: number;
  universitiesCreated: number;
  universitiesUpdated: number;
  publishedAt: string;
};

@Injectable()
export class DataEntryPublishService {
  constructor(private readonly db: AppDbContext) {}

  async getPublishReadiness(batchId: string): Promise<DataEntryPublishReadinessDto> {
    const batch = await this.requireBatch(batchId);
    const uniId = await this.resolveUniversityId(batch);
    const allRowsValid = batch.rowCount > 0 && batch.invalidRowCount === 0;

    return {
      batchId: batch.id,
      batchType: batch.batchType ?? DataEntryBatchType.COURSE,
      sysUniversityId: uniId,
      sysCountryId: batch.sysCountryId ?? null,
      rowCount: batch.rowCount,
      invalidRowCount: batch.invalidRowCount,
      allRowsValid,
      canPublish: this.canPublishValidRows(batch),
      status: batch.status,
      publishedAt: batch.publishedAt?.toISOString() ?? null,
      targetTables:
        batch.batchType === DataEntryBatchType.UNIVERSITY
          ? [
              'sys_Countries',
              'sys_States',
              'sys_Cities',
              'sys_Universities',
              'UniApplicationStage',
            ]
          : [
              'sys_Programmes',
              'UniCourses',
              'UniCourseIntakes',
              'CourseIntakeScholarships',
              'CourseEngReq',
              'UniAcademicReq',
              'UniEngReq',
            ],
    };
  }

  async publishBatchToCatalog(batchId: string): Promise<DataEntryPublishResultDto> {
    const readiness = await this.getPublishReadiness(batchId);
    if (!readiness.canPublish) {
      throw new BadRequestException(
        'Batch is not ready to publish (no valid rows, or already published).',
      );
    }

    const batch = await this.requireBatch(batchId);
    if (batch.batchType === DataEntryBatchType.UNIVERSITY) {
      return this.publishUniversityBatch(batch);
    }
    return this.publishCourseBatch(batch);
  }

  async markBatchValidatedIfComplete(batchId: string): Promise<void> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (
      !batch ||
      batch.status === DataEntryBatchStatus.PUBLISHED ||
      batch.status === DataEntryBatchStatus.AWAITING_UPLOAD ||
      batch.status === DataEntryBatchStatus.FAILED
    ) {
      return;
    }
    const table =
      batch.batchType === DataEntryBatchType.UNIVERSITY
        ? DataEntryUniversityRows
        : DataEntryCourseRows;
    const invalid = await this.db.Set(table).count({
      where: { batchId, isValid: false },
    });
    batch.invalidRowCount = invalid;
    if (batch.rowCount > 0 && invalid === 0) {
      batch.status = DataEntryBatchStatus.VALIDATED;
    } else if (batch.status === DataEntryBatchStatus.VALIDATED && invalid > 0) {
      batch.status = DataEntryBatchStatus.READY;
    }
    await this.db.Set(DataEntryBatches).save(batch);
  }

  private async publishUniversityBatch(
    batch: DataEntryBatches,
  ): Promise<DataEntryPublishResultDto> {
    const rows = await this.db.Set(DataEntryUniversityRows).find({
      where: { batchId: batch.id, isValid: true },
      order: { rowIndex: 'ASC' },
    });
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows to publish');
    }

    let universitiesCreated = 0;
    let universitiesUpdated = 0;
    const insertedIds: string[] = [];
    const skipped = Math.max(0, batch.rowCount - rows.length);

    await this.db.transaction(async (manager) => {
      const geo = new DataEntryGeoLookup(manager);
      for (const row of rows) {
        const stats = await publishUniversityRowToCatalog(
          manager,
          geo,
          row.fields,
        );
        if (stats.inserted) {
          universitiesCreated += 1;
          insertedIds.push(stats.universityId);
        } else {
          universitiesUpdated += 1;
        }
      }
      await seedUniApplicationStages(manager, insertedIds);
      this.markPublished(batch, skipped === 0);
      await manager.save(DataEntryBatches, batch);
    });

    return {
      message: this.publishMessage('university', rows.length, skipped),
      batchType: DataEntryBatchType.UNIVERSITY,
      coursesCreated: 0,
      intakesCreated: 0,
      scholarshipsCreated: 0,
      engReqsCreated: 0,
      uniAcademicReqsCreated: 0,
      uniEngReqsCreated: 0,
      universitiesCreated,
      universitiesUpdated,
      publishedAt: batch.publishedAt!.toISOString(),
    };
  }

  private async publishCourseBatch(
    batch: DataEntryBatches,
  ): Promise<DataEntryPublishResultDto> {
    const rows = await this.db.Set(DataEntryCourseRows).find({
      where: { batchId: batch.id, isValid: true },
      order: { rowIndex: 'ASC' },
    });
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows to publish');
    }

    let coursesCreated = 0;
    let intakesCreated = 0;
    let scholarshipsCreated = 0;
    let engReqsCreated = 0;
    let uniAcademicReqsCreated = 0;
    let uniEngReqsCreated = 0;
    const skipped = Math.max(0, batch.rowCount - rows.length);

    await this.db.transaction(async (manager) => {
      const lookup = new DataEntryCatalogLookup(manager);
      const fieldsByUni = new Map<string, Record<string, string>[]>();
      const publishedCourseIdsByUni = new Map<string, string[]>();

      for (const row of rows) {
        const uniId = await this.resolveRowUniversityId(
          manager,
          batch,
          row.fields,
          row.rowIndex,
        );
        const stats = await publishStagingRowToCatalog(
          manager,
          lookup,
          uniId,
          row.fields,
        );
        coursesCreated += stats.courses;
        intakesCreated += stats.intakes;
        scholarshipsCreated += stats.scholarships;
        engReqsCreated += stats.engReqs;
        const list = publishedCourseIdsByUni.get(uniId) ?? [];
        list.push(stats.courseId);
        publishedCourseIdsByUni.set(uniId, list);
        const uniFields = fieldsByUni.get(uniId) ?? [];
        uniFields.push(row.fields);
        fieldsByUni.set(uniId, uniFields);
      }

      for (const [uniId, courseIds] of publishedCourseIdsByUni) {
        if (courseIds.length === 0) continue;
        await manager
          .createQueryBuilder()
          .delete()
          .from(UniCourses)
          .where('"uniId" = :uniId', { uniId })
          .andWhere('"id" NOT IN (:...ids)', { ids: courseIds })
          .execute();
      }

      for (const [uniId, allFields] of fieldsByUni) {
        const uniReqs = await publishUniversityLevelReqs(
          manager,
          lookup,
          uniId,
          allFields,
        );
        uniAcademicReqsCreated += uniReqs.academic;
        uniEngReqsCreated += uniReqs.english;
      }

      this.markPublished(batch, skipped === 0);
      if (!batch.sysUniversityId && publishedCourseIdsByUni.size === 1) {
        batch.sysUniversityId = [...publishedCourseIdsByUni.keys()][0];
      }
      await manager.save(DataEntryBatches, batch);
    });

    return {
      message: this.publishMessage('course', rows.length, skipped),
      batchType: DataEntryBatchType.COURSE,
      coursesCreated,
      intakesCreated,
      scholarshipsCreated,
      engReqsCreated,
      uniAcademicReqsCreated,
      uniEngReqsCreated,
      universitiesCreated: 0,
      universitiesUpdated: 0,
      publishedAt: batch.publishedAt!.toISOString(),
    };
  }

  private async resolveRowUniversityId(
    manager: EntityManager,
    batch: DataEntryBatches,
    fields: Record<string, string>,
    rowIndex: number,
  ): Promise<string> {
    const uniName = (fields.uniName ?? '').trim();
    if (uniName) {
      const uni = await manager
        .createQueryBuilder(SysUniversities, 'u')
        .where('lower(trim(u.uniName)) = :n', { n: uniName.toLowerCase() })
        .andWhere('u.deletedAt IS NULL')
        .getOne();
      if (!uni) {
        throw new BadRequestException(
          `Row ${rowIndex}: university "${uniName}" not found. Publish a university CSV first.`,
        );
      }
      return uni.id;
    }
    if (batch.sysUniversityId) {
      return batch.sysUniversityId;
    }
    throw new BadRequestException(
      `Row ${rowIndex}: uniName is required to publish`,
    );
  }

  private canPublishValidRows(batch: DataEntryBatches): boolean {
    const valid = batch.rowCount - batch.invalidRowCount;
    if (valid <= 0) return false;
    return (
      batch.status !== DataEntryBatchStatus.PUBLISHED &&
      batch.status !== DataEntryBatchStatus.AWAITING_UPLOAD &&
      batch.status !== DataEntryBatchStatus.FAILED &&
      batch.status !== DataEntryBatchStatus.IMPORTING
    );
  }

  private markPublished(batch: DataEntryBatches, allRowsValid: boolean): void {
    batch.publishedAt = new Date();
    if (allRowsValid) {
      batch.status = DataEntryBatchStatus.PUBLISHED;
    }
  }

  private publishMessage(
    kind: 'course' | 'university',
    published: number,
    skipped: number,
  ): string {
    const noun = kind === 'course' ? 'course' : 'university';
    if (skipped > 0) {
      return `Published ${published} valid ${noun} rows to catalog. ${skipped} invalid rows were skipped.`;
    }
    return `Published ${published} ${noun} rows to catalog tables.`;
  }

  private async requireBatch(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new BadRequestException('Batch not found');
    }
    return batch;
  }

  private async resolveUniversityId(
    batch: DataEntryBatches,
  ): Promise<string | null> {
    if (batch.sysUniversityId) {
      return batch.sysUniversityId;
    }
    const uni = await this.db.Set(SysUniversities).findOne({
      where: { uniName: batch.universityKey },
    });
    return uni?.id ?? null;
  }
}
