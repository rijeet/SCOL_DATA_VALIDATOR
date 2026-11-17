import { isCourseRowFieldRequired } from '@shared/validation/courseRowFieldValidation';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { UniversityRowValidator } from '../university/UniversityRowValidator';
import { normalizeStagingUniversityRow } from '../university/UniversityImportSchema';
import type { DataEntryUniversityListItemDto } from '@shared/dtos/data-entry/DataEntryUniversityListItemDto';
import { parseCsv } from '../common/engine/CsvParser';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { normalizeCourseCsvRow } from '../course/dto/CourseImportRowTypes';
import { normalizeStagingCourseRow } from './courseStagingHeaders';
import { DataEntryCloudCatalogService } from './DataEntryCloudCatalogService';
import { DataEntryPublishService } from './DataEntryPublishService';
import type { CsvRow } from '../common/abstractions/CsvImportProcessor';

@Injectable()
export class DataEntryStagingService {
  constructor(
    private readonly db: AppDbContext,
    private readonly catalog: DataEntryCloudCatalogService,
    private readonly validator: CourseRowValidator,
    private readonly universityValidator: UniversityRowValidator,
    private readonly publish: DataEntryPublishService,
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

  /**
   * Create sys_Universities rows for Cloudinary pack names (UK default country).
   */
  async syncSysUniversitiesFromCloud(): Promise<{
    created: string[];
    skipped: number;
  }> {
    const country = await this.db.Set(SysCountries).findOne({
      where: { countryCode: 'GB' },
    });
    if (!country) {
      throw new BadRequestException(
        'No United Kingdom row in sys_Countries. Run migration 1789300000000-data-admin-sys-universities.',
      );
    }

    const packs = await this.catalog.listUniversityPacks();
    const created: string[] = [];
    let skipped = 0;

    for (const pack of packs) {
      const name = pack.universityKey.trim();
      if (!name) {
        skipped++;
        continue;
      }
      const existing = await this.db.Set(SysUniversities).findOne({
        where: { uniName: name },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const row = this.db.Set(SysUniversities).create({
        uniName: name,
        sysCountryId: country.id,
      });
      await this.db.Set(SysUniversities).save(row);
      created.push(name);
    }

    return { created, skipped };
  }

  async resolveSysUniversity(sysUniversityId: string): Promise<SysUniversities> {
    const uni = await this.db.Set(SysUniversities).findOne({
      where: { id: sysUniversityId },
    });
    if (!uni) {
      throw new NotFoundException('University not found in sys_Universities');
    }
    return uni;
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

  async importFromCloudForSysUniversity(
    sysUniversityId: string,
    createdByUserId?: string,
    options?: { replaceExisting?: boolean },
  ): Promise<DataEntryBatches> {
    const uni = await this.resolveSysUniversity(sysUniversityId);
    const existing = await this.findLatestBatchForUniversityKey(uni.uniName);
    if (existing && !options?.replaceExisting) {
      throw new ConflictException(
        'Staging data already exists for this university. Continue validation or re-import with replaceExisting.',
      );
    }
    return this.importFromCloud(
      uni.uniName,
      createdByUserId,
      uni.uniName,
      uni.id,
    );
  }

  async importFromCloud(
    universityKey: string,
    createdByUserId?: string,
    displayName?: string,
    sysUniversityId?: string,
  ): Promise<DataEntryBatches> {
    const pack = await this.catalog.resolvePack(universityKey);
    const csvText = await this.catalog.readCsvText(universityKey);
    const parsed = parseCsv(csvText);
    if (parsed.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }

    const batch = this.db.Set(DataEntryBatches).create({
      universityKey,
      displayName: displayName ?? universityKey,
      csvObjectKey: pack.csvPublicId,
      status: DataEntryBatchStatus.IMPORTING,
      rowCount: 0,
      invalidRowCount: 0,
      helperObjectKeys: pack.helperPublicIds,
      createdByUserId: createdByUserId ?? null,
      sysUniversityId: sysUniversityId ?? null,
    });
    await this.db.Set(DataEntryBatches).save(batch);

    let invalidCount = 0;
    const rowEntities: DataEntryCourseRows[] = [];

    parsed.forEach((raw, idx) => {
      const fields = normalizeStagingCourseRow(raw as CsvRow);
      const courseRow = normalizeCourseCsvRow(fields as CsvRow);
      const fieldErrors = this.validator.validateRowFieldErrors(courseRow);
      const isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);
      if (!isValid) invalidCount++;

      rowEntities.push(
        this.db.Set(DataEntryCourseRows).create({
          batchId: batch.id,
          rowIndex: idx + 1,
          fields,
          fieldErrors,
          isValid,
        }),
      );
    });

    await this.db.Set(DataEntryCourseRows).save(rowEntities);

    batch.rowCount = rowEntities.length;
    batch.invalidRowCount = invalidCount;
    batch.status = DataEntryBatchStatus.READY;
    await this.db.Set(DataEntryBatches).save(batch);
    await this.publish.markBatchValidatedIfComplete(batch.id);

    return batch;
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
      throw new ConflictException('Published batches cannot be edited');
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
    const merged = { ...row.fields, ...fields };
    const normalized = normalizeStagingCourseRow(merged as CsvRow);
    const courseRow = normalizeCourseCsvRow(normalized as CsvRow);
    const fieldErrors = this.validator.validateRowFieldErrors(courseRow);
    const isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);

    row.fields = normalized;
    row.fieldErrors = fieldErrors;
    row.isValid = isValid;
    await this.db.Set(DataEntryCourseRows).save(row);

    await this.recomputeBatchCounts(batchId);

    return row;
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

  private async recomputeBatchCounts(batchId: string): Promise<void> {
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
