import { isCourseRowFieldRequired } from '@shared/validation/courseRowFieldValidation';
import { POST_PUBLISH_UNI_EDITABLE_FIELDS } from '@shared/validation/universityRowFieldValidation';
import { courseCommissionAmount } from '@shared/validation/courseCommissionAmount';
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
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
import { UniversityRowValidator } from '../university/UniversityRowValidator';
import { normalizeStagingUniversityRow } from '../university/UniversityImportSchema';
import type { DataEntryUniversityListItemDto } from '@shared/dtos/data-entry/DataEntryUniversityListItemDto';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { normalizeCourseCsvRow } from '../course/dto/CourseImportRowTypes';
import { normalizeStagingCourseRow } from './courseStagingHeaders';
import { DataEntryPublishService } from './DataEntryPublishService';
import { DataEntryDashboardService } from './DataEntryDashboardService';
import { DataEntryCatalogLookup } from './DataEntryCatalogLookup';
import { universityCatalogInfoUpdate } from './publishUniversityRowToCatalog';
import type { CsvRow } from '../common/abstractions/CsvImportProcessor';
import type { EntityManager } from 'typeorm';
import {
  allocateCourseKey,
  courseKeyBase,
} from '@shared/constants/courseKey.constants';
@Injectable()
export class DataEntryStagingService {
  constructor(
    private readonly db: AppDbContext,
    private readonly validator: CourseRowValidator,
    private readonly universityValidator: UniversityRowValidator,
    private readonly publish: DataEntryPublishService,
    private readonly dashboard: DataEntryDashboardService,
  ) {}

  async listSysUniversitiesForDataEntry(): Promise<
    DataEntryUniversityListItemDto[]
  > {
    const unis = await this.db.Set(SysUniversities).find({
      select: ['id', 'uniName'],
      order: { uniName: 'ASC' },
    });

    const items: DataEntryUniversityListItemDto[] = [];
    for (const uni of unis) {
      const batch = await this.findLatestBatchForUniversityKey(uni.uniName);
      items.push({
        sysUniversityId: uni.id,
        uniName: uni.uniName,
        staging: batch
          ? {
              batchId: batch.id,
              rowCount: batch.rowCount,
              invalidRowCount: batch.invalidRowCount,
              validRowCount: Math.max(
                0,
                batch.rowCount - batch.invalidRowCount,
              ),
              status: batch.status,
              publishedAt: batch.publishedAt?.toISOString() ?? null,
            }
          : null,
      });
    }
    return items;
  }

  async findLatestBatchForUniversityKey(
    universityKey: string,
  ): Promise<DataEntryBatches | null> {
    return this.db.Set(DataEntryBatches).findOne({
      where: { universityKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getBatch(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
      relations: { SysCountry: true },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    return batch;
  }

  async getUniversityCommissionForBatch(batch: DataEntryBatches): Promise<{
    commission: string;
    commissionType: string;
  } | null> {
    let uni: SysUniversities | null = null;
    if (batch.sysUniversityId) {
      uni = await this.db.Set(SysUniversities).findOne({
        where: { id: batch.sysUniversityId },
      });
    }
    if (!uni && batch.universityKey) {
      uni = await this.db
        .Set(SysUniversities)
        .createQueryBuilder('u')
        .where('lower(trim(u.uniName)) = :n', {
          n: batch.universityKey.trim().toLowerCase(),
        })
        .andWhere('u.deletedAt IS NULL')
        .getOne();
    }
    if (!uni) return null;
    return {
      commission: (uni.commission ?? '').toString(),
      commissionType: uni.commissionType ?? '',
    };
  }

  async listInvalidRowIndexes(batchId: string): Promise<number[]> {
    const batch = await this.getBatch(batchId);
    const table =
      batch.batchType === DataEntryBatchType.UNIVERSITY
        ? DataEntryUniversityRows
        : DataEntryCourseRows;
    const rows = await this.db.Set(table).find({
      where: { batchId, isValid: false },
      order: { rowIndex: 'ASC' },
      select: ['rowIndex'],
    });
    return rows.map((r) => r.rowIndex);
  }

  async getRow(
    batchId: string,
    rowIndex: number,
  ): Promise<DataEntryCourseRows | DataEntryUniversityRows> {
    const batch = await this.getBatch(batchId);
    if (batch.batchType === DataEntryBatchType.UNIVERSITY) {
      const row = await this.db.Set(DataEntryUniversityRows).findOne({
        where: { batchId, rowIndex },
      });
      if (!row) throw new NotFoundException('Row not found');
      return row;
    }
    const row = await this.db.Set(DataEntryCourseRows).findOne({
      where: { batchId, rowIndex },
    });
    if (!row) {
      throw new NotFoundException('Row not found');
    }
    return row;
  }

  async updateRow(
    batchId: string,
    rowIndex: number,
    fields: Record<string, string>,
  ): Promise<DataEntryCourseRows | DataEntryUniversityRows> {
    const batch = await this.getBatch(batchId);
    if (batch.status === DataEntryBatchStatus.PUBLISHED) {
      if (batch.batchType !== DataEntryBatchType.UNIVERSITY) {
        throw new ConflictException('Published batches cannot be edited');
      }
      return this.updatePublishedUniversityInfo(batch, rowIndex, fields);
    }
    if (batch.batchType === DataEntryBatchType.UNIVERSITY) {
      const row = await this.db.Set(DataEntryUniversityRows).findOne({
        where: { batchId, rowIndex },
      });
      if (!row) throw new NotFoundException('Row not found');
      const merged = { ...row.fields, ...fields };
      const normalized = normalizeStagingUniversityRow(merged);
      const fieldErrors =
        this.universityValidator.validateRowFieldErrors(normalized);
      row.fields = normalized;
      row.fieldErrors = fieldErrors;
      row.isValid = this.universityValidator.isRowValid(fieldErrors);
      await this.db.Set(DataEntryUniversityRows).save(row);
      await this.recomputeBatchCounts(batchId);
      return row;
    }

    const row = await this.db.Set(DataEntryCourseRows).findOne({
      where: { batchId, rowIndex },
    });
    if (!row) throw new NotFoundException('Row not found');
    const previousDegree = (row.fields.degreeName ?? '').trim();
    const previousKey = (row.fields.courseKey ?? '').trim();
    const rest = { ...fields };
    delete rest.commission;
    delete rest.courseKey;
    const merged = { ...row.fields, ...rest };
    merged.courseKey = previousKey;
    const uniCommission = await this.getUniversityCommissionForBatch(batch);
    if (uniCommission) {
      merged.commission = courseCommissionAmount({
        commissionType: uniCommission.commissionType,
        commission: uniCommission.commission,
        tuitionFee: merged.tuitionFee ?? '',
      });
    }
    const normalized = normalizeStagingCourseRow(merged as CsvRow);
    normalized.courseKey = previousKey.toLowerCase();
    if (!normalized.courseKey) {
      const siblings = await this.db.Set(DataEntryCourseRows).find({
        where: { batchId },
        select: ['id', 'fields'],
      });
      const used = new Set<string>();
      for (const s of siblings) {
        const k = (s.fields.courseKey ?? '').trim().toLowerCase();
        if (k) used.add(k);
      }
      normalized.courseKey = allocateCourseKey(
        courseKeyBase({
          uniName:
            (normalized.uniName ?? '').trim() || batch.universityKey || '',
          degreeName: normalized.degreeName ?? '',
          courseName: normalized.courseName ?? '',
          courseDuration: normalized.courseDuration ?? '',
        }),
        used,
      );
    }
    const courseRow = normalizeCourseCsvRow(normalized as CsvRow);
    const fieldErrors = this.validator.validateRowFieldErrors(courseRow);
    const isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);

    row.fields = normalized;
    row.fieldErrors = fieldErrors;
    row.isValid = isValid;
    await this.db.Set(DataEntryCourseRows).save(row);

    await this.recomputeBatchCounts(batchId);

    const nextDegree = (normalized.degreeName ?? '').trim();
    if (
      previousDegree &&
      nextDegree &&
      previousDegree.toLowerCase() !== nextDegree.toLowerCase()
    ) {
      await this.syncCatalogAwardedDegree(batch, {
        courseName: normalized.courseName ?? '',
        fromDegreeName: previousDegree,
        toDegreeName: nextDegree,
      });
    }

    return row;
  }

  private async syncCatalogAwardedDegree(
    batch: DataEntryBatches,
    args: {
      courseName: string;
      fromDegreeName: string;
      toDegreeName: string;
    },
  ): Promise<void> {
    const courseName = args.courseName.trim();
    if (!courseName) return;
    const uniId =
      batch.sysUniversityId ??
      (
        await this.db.Set(SysUniversities).findOne({
          where: { uniName: batch.universityKey },
        })
      )?.id;
    if (!uniId) return;

    let changed = false;
    await this.db.transaction(async (manager) => {
      const lookup = new DataEntryCatalogLookup(manager);
      const fromId = await lookup.degree(args.fromDegreeName);
      const toId = await lookup.degree(args.toDegreeName);
      const sameName = await manager
        .createQueryBuilder(UniCourses, 'c')
        .where('c.uniId = :uniId', { uniId })
        .andWhere('lower(trim(c.courseName)) = :name', {
          name: courseName.toLowerCase(),
        })
        .andWhere('c.deletedAt IS NULL')
        .getMany();
      const fromCourse = sameName.find((c) => c.sysDegreeId === fromId);
      const toCourse = sameName.find((c) => c.sysDegreeId === toId);
      if (fromCourse && toCourse && fromCourse.id !== toCourse.id) {
        await manager.softDelete(UniCourses, fromCourse.id);
        changed = true;
        return;
      }
      const target = fromCourse ?? (sameName.length === 1 ? sameName[0] : null);
      if (target && target.sysDegreeId !== toId) {
        target.sysDegreeId = toId;
        await manager.save(UniCourses, target);
        changed = true;
      }
    });

    if (changed) {
      await this.dashboard.refresh(batch.createdByUserId ?? batch.id);
    }
  }

  private async updatePublishedUniversityInfo(
    batch: DataEntryBatches,
    rowIndex: number,
    fields: Record<string, string>,
  ): Promise<DataEntryUniversityRows> {
    const row = await this.db.Set(DataEntryUniversityRows).findOne({
      where: { batchId: batch.id, rowIndex },
    });
    if (!row) throw new NotFoundException('Row not found');

    const allowed: Record<string, string> = {};
    for (const key of POST_PUBLISH_UNI_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        allowed[key] = fields[key] ?? '';
      }
    }
    const previousCommission = (row.fields.commission ?? '').trim();
    const previousType = (row.fields.commissionType ?? '').trim().toLowerCase();
    const merged = { ...row.fields, ...allowed };
    const normalized = normalizeStagingUniversityRow(merged);
    const fieldErrors =
      this.universityValidator.validateRowFieldErrors(normalized);
    row.fields = normalized;
    row.fieldErrors = fieldErrors;
    row.isValid = this.universityValidator.isRowValid(fieldErrors);
    const commissionChanged =
      previousCommission !== (normalized.commission ?? '').trim() ||
      previousType !== (normalized.commissionType ?? '').trim().toLowerCase();

    await this.db.transaction(async (manager) => {
      await manager.save(DataEntryUniversityRows, row);
      if (!row.isValid) return;
      const uniName = (normalized.uniName ?? '').trim();
      const uni = await manager
        .createQueryBuilder(SysUniversities, 'u')
        .where('lower(trim(u.uniName)) = :n', { n: uniName.toLowerCase() })
        .andWhere('u.deletedAt IS NULL')
        .getOne();
      if (!uni) {
        throw new NotFoundException(
          `Published university not found in catalog: ${uniName}`,
        );
      }
      await manager.update(
        SysUniversities,
        { id: uni.id },
        universityCatalogInfoUpdate(normalized),
      );
      if (commissionChanged) {
        await this.cascadeCommissionToCourseRows(
          manager,
          uni,
          normalized.commissionType ?? '',
          (normalized.commission ?? '').trim(),
        );
      }
    });

    await this.recomputeBatchCounts(batch.id);
    return row;
  }

  private async cascadeCommissionToCourseRows(
    manager: EntityManager,
    uni: SysUniversities,
    commissionType: string,
    commission: string,
  ): Promise<void> {
    const courseBatch = await manager
      .createQueryBuilder(DataEntryBatches, 'b')
      .where('b.batchType = :type', { type: DataEntryBatchType.COURSE })
      .andWhere('b.deletedAt IS NULL')
      .andWhere(
        '(b.sysUniversityId = :uniId OR b.universityKey = :key)',
        { uniId: uni.id, key: uni.uniName },
      )
      .orderBy('b.createdAt', 'DESC')
      .getOne();
    if (!courseBatch) return;
    const rows = await manager.find(DataEntryCourseRows, {
      where: { batchId: courseBatch.id },
    });
    for (const courseRow of rows) {
      courseRow.fields = {
        ...courseRow.fields,
        commission: courseCommissionAmount({
          commissionType,
          commission,
          tuitionFee: courseRow.fields.tuitionFee ?? '',
        }),
      };
      await manager.save(DataEntryCourseRows, courseRow);
    }
  }

  /**
   * Re-run validation on every row of a batch (e.g. after validation rules change).
   * Published batches are left untouched.
   */
  async revalidateBatch(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.getBatch(batchId);
    if (batch.status === DataEntryBatchStatus.PUBLISHED) {
      throw new ConflictException('Published batches cannot be revalidated');
    }
    if (batch.batchType === DataEntryBatchType.UNIVERSITY) {
      const rows = await this.db.Set(DataEntryUniversityRows).find({
        where: { batchId },
        order: { rowIndex: 'ASC' },
      });
      for (const row of rows) {
        const normalized = normalizeStagingUniversityRow(row.fields);
        const fieldErrors =
          this.universityValidator.validateRowFieldErrors(normalized);
        row.fields = normalized;
        row.fieldErrors = fieldErrors;
        row.isValid = this.universityValidator.isRowValid(fieldErrors);
      }
      await this.db.Set(DataEntryUniversityRows).save(rows);
    } else {
      const rows = await this.db.Set(DataEntryCourseRows).find({
        where: { batchId },
        order: { rowIndex: 'ASC' },
      });
      for (const row of rows) {
        const normalized = normalizeStagingCourseRow(row.fields as CsvRow);
        const courseRow = normalizeCourseCsvRow(normalized as CsvRow);
        const fieldErrors = this.validator.validateRowFieldErrors(courseRow);
        row.fields = normalized;
        row.fieldErrors = fieldErrors;
        row.isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);
      }
      await this.db.Set(DataEntryCourseRows).save(rows);
    }
    await this.recomputeBatchCounts(batchId);
    return this.getBatch(batchId);
  }

  async recomputeBatchCounts(batchId: string): Promise<void> {
    const batch = await this.getBatch(batchId);
    const table =
      batch.batchType === DataEntryBatchType.UNIVERSITY
        ? DataEntryUniversityRows
        : DataEntryCourseRows;
    const invalidRowCount = await this.db
      .Set(table)
      .count({ where: { batchId, isValid: false } });
    const rowCount = await this.db.Set(table).count({ where: { batchId } });
    await this.db.Set(DataEntryBatches).update(
      { id: batchId },
      { invalidRowCount, rowCount },
    );
    await this.publish.markBatchValidatedIfComplete(batchId);
  }
}
