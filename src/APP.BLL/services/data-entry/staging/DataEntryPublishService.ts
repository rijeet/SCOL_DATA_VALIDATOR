import { BadRequestException, Injectable } from '@nestjs/common';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import {
  DataEntryBatches,
  DataEntryBatchStatus,
} from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { DataEntryCatalogLookup } from './DataEntryCatalogLookup';
import { publishStagingRowToCatalog } from './publishStagingRowToCatalog';
import { publishUniversityLevelReqs } from './publishUniversityLevelReqs';

export type DataEntryPublishReadinessDto = {
  batchId: string;
  sysUniversityId: string | null;
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
  coursesCreated: number;
  intakesCreated: number;
  scholarshipsCreated: number;
  engReqsCreated: number;
  uniAcademicReqsCreated: number;
  uniEngReqsCreated: number;
  publishedAt: string;
};

@Injectable()
export class DataEntryPublishService {
  constructor(private readonly db: AppDbContext) {}

  async getPublishReadiness(batchId: string): Promise<DataEntryPublishReadinessDto> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new BadRequestException('Batch not found');
    }

    const uniId = await this.resolveUniversityId(batch);
    const allRowsValid =
      batch.rowCount > 0 && batch.invalidRowCount === 0;
    const canPublish =
      allRowsValid &&
      batch.status !== DataEntryBatchStatus.PUBLISHED &&
      Boolean(uniId);

    return {
      batchId: batch.id,
      sysUniversityId: uniId,
      rowCount: batch.rowCount,
      invalidRowCount: batch.invalidRowCount,
      allRowsValid,
      canPublish,
      status: batch.status,
      publishedAt: batch.publishedAt?.toISOString() ?? null,
      targetTables: [
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
        'Batch is not ready to publish (fix invalid rows, link sys university, or already published).',
      );
    }

    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new BadRequestException('Batch not found');
    }

    const uniId = await this.resolveUniversityId(batch);
    if (!uniId) {
      throw new BadRequestException('University not linked to batch');
    }

    const rows = await this.db.Set(DataEntryCourseRows).find({
      where: { batchId },
      order: { rowIndex: 'ASC' },
    });
    if (rows.length === 0) {
      throw new BadRequestException('Batch has no staging rows');
    }

    let coursesCreated = 0;
    let intakesCreated = 0;
    let scholarshipsCreated = 0;
    let engReqsCreated = 0;
    let uniAcademicReqsCreated = 0;
    let uniEngReqsCreated = 0;

    await this.db.transaction(async (manager) => {
      await manager.delete(UniCourses, { uniId });

      const lookup = new DataEntryCatalogLookup(manager);
      const allFields = rows.map((r) => r.fields);

      for (const row of rows) {
        if (!row.isValid) {
          throw new BadRequestException(
            `Row ${row.rowIndex} is invalid; cannot publish`,
          );
        }
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
      }

      const uniReqs = await publishUniversityLevelReqs(
        manager,
        lookup,
        uniId,
        allFields,
      );
      uniAcademicReqsCreated = uniReqs.academic;
      uniEngReqsCreated = uniReqs.english;

      batch.status = DataEntryBatchStatus.PUBLISHED;
      batch.publishedAt = new Date();
      if (!batch.sysUniversityId) {
        batch.sysUniversityId = uniId;
      }
      await manager.save(DataEntryBatches, batch);
    });

    return {
      message: 'Published staging batch to catalog tables.',
      coursesCreated,
      intakesCreated,
      scholarshipsCreated,
      engReqsCreated,
      uniAcademicReqsCreated,
      uniEngReqsCreated,
      publishedAt: batch.publishedAt!.toISOString(),
    };
  }

  async markBatchValidatedIfComplete(batchId: string): Promise<void> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch || batch.status === DataEntryBatchStatus.PUBLISHED) {
      return;
    }
    const invalid = await this.db.Set(DataEntryCourseRows).count({
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
