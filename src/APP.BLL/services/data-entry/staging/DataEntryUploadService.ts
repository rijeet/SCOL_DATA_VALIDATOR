import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { CloudinaryUniversityDataService } from '@infra/cloudinary/CloudinaryUniversityData.service';
import {
  DataEntryBatches,
  DataEntryBatchStatus,
} from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { DataEntryUniversityRows } from '@entity/entities/DataEntryUniversityRows.entity';
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { DataEntryUniversityListItemDto } from '@shared/dtos/data-entry/DataEntryUniversityListItemDto';
import {
  DATA_ENTRY_HELPER_KEYS,
  DATA_ENTRY_MAX_FILE_BYTES,
  UNIVERSITY_IMAGE_CLOUD_PREFIX,
  UNIVERSITY_IMAGE_EXTENSIONS,
  type DataEntryHelperKey,
} from '@shared/constants/dataEntryCloud.constants';
import { GenerateDataEntryUploadUrlRequestDto } from '@shared/dtos/data-entry/GenerateDataEntryUploadUrlRequestDto';
import { GenerateUniversityImageUploadUrlRequestDto } from '@shared/dtos/data-entry/GenerateUniversityImageUploadUrlRequestDto';
import { slugify } from '@shared/utils/slugify';
import { parseCsv } from '../common/engine/CsvParser';
import { validateSchema } from '../common/engine/HeaderValidator';
import { CourseImportSchema } from '../course/CourseImportSchema';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { normalizeCourseCsvRow } from '../course/dto/CourseImportRowTypes';
import { normalizeStagingCourseRow } from './courseStagingHeaders';
import {
  UniversityImportSchema,
  normalizeStagingUniversityRow,
} from '../university/UniversityImportSchema';
import { UniversityRowValidator } from '../university/UniversityRowValidator';
import { isCourseRowFieldRequired } from '@shared/validation/courseRowFieldValidation';
import { DataEntryStorageKeyBuilder } from './DataEntryStorageKeyBuilder';
import { DataEntryPublishService } from './DataEntryPublishService';
import type { CsvRow } from '../common/abstractions/CsvImportProcessor';

export type CloudinarySignedUploadDto = {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  folder?: string;
  resourceType: 'raw' | 'image';
  overwrite: string;
  tags?: string;
};

@Injectable()
export class DataEntryUploadService {
  constructor(
    private readonly db: AppDbContext,
    private readonly cloudinary: CloudinaryUniversityDataService,
    private readonly keys: DataEntryStorageKeyBuilder,
    private readonly courseValidator: CourseRowValidator,
    private readonly universityValidator: UniversityRowValidator,
    private readonly publish: DataEntryPublishService,
  ) {}

  async generateUploadUrl(
    userId: string,
    dto: GenerateDataEntryUploadUrlRequestDto,
  ): Promise<{
    batchId: string;
    csv: CloudinarySignedUploadDto;
    helpers: Partial<Record<DataEntryHelperKey, CloudinarySignedUploadDto>>;
  }> {
    if (!dto.fileName.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only .csv files are accepted');
    }
    if (
      dto.fileSizeBytes < 1 ||
      dto.fileSizeBytes > DATA_ENTRY_MAX_FILE_BYTES
    ) {
      throw new BadRequestException(
        `File size must be between 1 byte and ${DATA_ENTRY_MAX_FILE_BYTES} bytes`,
      );
    }

    const country = await this.db.Set(SysCountries).findOne({
      where: { id: dto.sysCountryId },
    });
    if (!country) {
      throw new BadRequestException('Country not found');
    }
    const countryCode = (country.countryCode ?? 'XX').toUpperCase();
    const helperKeys = this.normalizeHelperKeys(dto.helperKeys);

    let universityKey = `${dto.type}:${countryCode}`;
    let sysUniversityId: string | null = null;
    let uniSlug: string | undefined;
    if (dto.type === DataEntryBatchType.COURSE) {
      if (!dto.sysUniversityId) {
        throw new BadRequestException(
          'Publish a university first, then import a course CSV for that university',
        );
      }
      const uni = await this.db.Set(SysUniversities).findOne({
        where: { id: dto.sysUniversityId },
      });
      if (!uni) {
        throw new BadRequestException('University not found');
      }
      if (uni.sysCountryId !== country.id) {
        throw new BadRequestException(
          'University does not belong to this destination',
        );
      }
      universityKey = uni.uniName;
      sysUniversityId = uni.id;
      uniSlug = slugify(uni.uniName);
      if (!uniSlug) {
        throw new BadRequestException('University name is required');
      }
    }

    const batchId = randomUUID();
    const csvPublicId = this.keys.csvPublicId(
      countryCode,
      dto.type,
      batchId,
      uniSlug,
    );
    const helperObjectKeys: Partial<Record<DataEntryHelperKey, string>> = {};
    const helpers: Partial<
      Record<DataEntryHelperKey, CloudinarySignedUploadDto>
    > = {};
    for (const helperKey of helperKeys) {
      const publicId = this.keys.helperPublicId(
        countryCode,
        dto.type,
        batchId,
        helperKey,
        uniSlug,
      );
      helperObjectKeys[helperKey] = publicId;
      helpers[helperKey] = this.cloudinary.generateSignedRawUpload(publicId);
    }

    await this.db.Set(DataEntryBatches).insert({
      id: batchId,
      batchType: dto.type,
      universityKey,
      displayName: dto.fileName.slice(0, 512),
      csvObjectKey: csvPublicId,
      sourceFileName: dto.fileName.slice(0, 255),
      status: DataEntryBatchStatus.AWAITING_UPLOAD,
      rowCount: 0,
      invalidRowCount: 0,
      helperObjectKeys,
      createdByUserId: userId,
      sysCountryId: country.id,
      sysUniversityId,
    });

    return {
      batchId,
      csv: this.cloudinary.generateSignedRawUpload(csvPublicId),
      helpers,
    };
  }

  async confirmUpload(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    if (batch.status !== DataEntryBatchStatus.AWAITING_UPLOAD) {
      throw new ConflictException('Batch is not awaiting upload');
    }

    const resolvedPublicId = await this.cloudinary.resolveRawPublicId(
      batch.csvObjectKey,
    );
    if (!resolvedPublicId) {
      throw new BadRequestException(
        'CSV not found in Cloudinary. Upload it first.',
      );
    }
    if (resolvedPublicId !== batch.csvObjectKey) {
      batch.csvObjectKey = resolvedPublicId;
      await this.db.Set(DataEntryBatches).save(batch);
    }

    batch.status = DataEntryBatchStatus.IMPORTING;
    batch.failureReason = null;
    await this.db.Set(DataEntryBatches).save(batch);

    try {
      const csvText = await this.cloudinary.fetchRawText(batch.csvObjectKey);
      if (batch.batchType === DataEntryBatchType.UNIVERSITY) {
        await this.stageUniversityCsv(batch, csvText);
      } else {
        await this.stageCourseCsv(batch, csvText);
      }
      await this.snapshotHelpers(batch);
      await this.publish.markBatchValidatedIfComplete(batch.id);
      return this.requireBatch(batch.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Import failed';
      batch.status = DataEntryBatchStatus.FAILED;
      batch.failureReason = message;
      await this.db.Set(DataEntryBatches).save(batch);
      throw err;
    }
  }

  async listDestinations(): Promise<
    Array<{
      sysCountryId: string;
      countryName: string;
      countryCode: string | null;
      batchCount: number;
      readyCount: number;
    }>
  > {
    const countries = await this.db.Set(SysCountries).find({
      order: { countryName: 'ASC' },
    });
    const batches = await this.db.Set(DataEntryBatches).find({
      select: ['id', 'sysCountryId', 'status'],
    });
    return countries.map((c) => {
      const countryBatches = batches.filter((b) => b.sysCountryId === c.id);
      return {
        sysCountryId: c.id,
        countryName: c.countryName,
        countryCode: c.countryCode ?? null,
        batchCount: countryBatches.length,
        readyCount: countryBatches.filter(
          (b) =>
            b.status === DataEntryBatchStatus.READY ||
            b.status === DataEntryBatchStatus.VALIDATED,
        ).length,
      };
    });
  }

  async generateUniversityImageUploadUrl(
    batchId: string,
    dto: GenerateUniversityImageUploadUrlRequestDto,
  ): Promise<CloudinarySignedUploadDto> {
    const batch = await this.requireBatch(batchId);
    if (batch.batchType !== DataEntryBatchType.UNIVERSITY) {
      throw new BadRequestException(
        'Image upload is only available for university batches',
      );
    }
    if (batch.status === DataEntryBatchStatus.PUBLISHED) {
      throw new ConflictException('Published batches cannot be edited');
    }
    const slug = slugify(dto.uniName);
    if (!slug) {
      throw new BadRequestException('University name is required');
    }
    const ext = dto.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (
      !UNIVERSITY_IMAGE_EXTENSIONS.includes(
        ext as (typeof UNIVERSITY_IMAGE_EXTENSIONS)[number],
      )
    ) {
      throw new BadRequestException(
        `Image must be ${UNIVERSITY_IMAGE_EXTENSIONS.join(', ')}`,
      );
    }
    if (
      dto.fileSizeBytes < 1 ||
      dto.fileSizeBytes > DATA_ENTRY_MAX_FILE_BYTES
    ) {
      throw new BadRequestException(
        `File size must be between 1 byte and ${DATA_ENTRY_MAX_FILE_BYTES} bytes`,
      );
    }
    const publicId = `${UNIVERSITY_IMAGE_CLOUD_PREFIX}/${slug}/${dto.kind}`;
    const tags = `university,${dto.kind}`;
    return this.cloudinary.generateSignedImageUpload(publicId, tags);
  }

  async discardBatch(batchId: string): Promise<{ deleted: true }> {
    const batch = await this.requireBatch(batchId);
    if (
      batch.status !== DataEntryBatchStatus.FAILED &&
      batch.status !== DataEntryBatchStatus.AWAITING_UPLOAD
    ) {
      throw new ConflictException(
        'Only failed or incomplete uploads can be deleted',
      );
    }
    await this.db.Set(DataEntryUniversityRows).delete({ batchId: batch.id });
    await this.db.Set(DataEntryCourseRows).delete({ batchId: batch.id });
    await this.db.Set(DataEntryBatches).softDelete(batch.id);
    return { deleted: true };
  }

  async listCountryBatches(sysCountryId: string): Promise<DataEntryBatches[]> {
    const country = await this.db.Set(SysCountries).findOne({
      where: { id: sysCountryId },
    });
    if (!country) {
      throw new NotFoundException('Country not found');
    }
    return this.db.Set(DataEntryBatches).find({
      where: { sysCountryId },
      order: { createdAt: 'DESC' },
    });
  }

  async listCountryUniversities(
    sysCountryId: string,
  ): Promise<DataEntryUniversityListItemDto[]> {
    const country = await this.db.Set(SysCountries).findOne({
      where: { id: sysCountryId },
    });
    if (!country) {
      throw new NotFoundException('Country not found');
    }
    const unis = await this.db.Set(SysUniversities).find({
      where: { sysCountryId },
      order: { uniName: 'ASC' },
      select: ['id', 'uniName'],
    });
    const courseBatches = await this.db.Set(DataEntryBatches).find({
      where: {
        sysCountryId,
        batchType: DataEntryBatchType.COURSE,
      },
      order: { createdAt: 'DESC' },
    });
    return unis.map((uni) => {
      const batch = courseBatches.find(
        (b) =>
          b.sysUniversityId === uni.id || b.universityKey === uni.uniName,
      );
      return {
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
      };
    });
  }

  async getGuide(
    batchId: string,
    helperKey: DataEntryHelperKey,
  ): Promise<{ helperKey: DataEntryHelperKey; markdown: string }> {
    if (!DATA_ENTRY_HELPER_KEYS.includes(helperKey)) {
      throw new BadRequestException(`Unknown helper "${helperKey}"`);
    }
    const batch = await this.requireBatch(batchId);
    const snap = batch.helperDocs?.[helperKey];
    if (snap) {
      return { helperKey, markdown: snap };
    }
    const publicId = batch.helperObjectKeys?.[helperKey];
    if (!publicId) {
      throw new NotFoundException(`Helper "${helperKey}" was not uploaded`);
    }
    const markdown = await this.cloudinary.fetchRawText(publicId);
    return { helperKey, markdown };
  }

  private async stageUniversityCsv(
    batch: DataEntryBatches,
    csvText: string,
  ): Promise<void> {
    const parsed = parseCsv(csvText);
    validateSchema(parsed, UniversityImportSchema.inputHeaders);
    await this.db.Set(DataEntryUniversityRows).delete({ batchId: batch.id });

    let invalidCount = 0;
    const rows: DataEntryUniversityRows[] = parsed.map((raw, idx) => {
      const fields = normalizeStagingUniversityRow(raw);
      const fieldErrors = this.universityValidator.validateRowFieldErrors(fields);
      const isValid = this.universityValidator.isRowValid(fieldErrors);
      if (!isValid) invalidCount++;
      return this.db.Set(DataEntryUniversityRows).create({
        batchId: batch.id,
        rowIndex: idx + 1,
        fields,
        fieldErrors,
        isValid,
      });
    });
    if (rows.length) {
      await this.db.Set(DataEntryUniversityRows).save(rows);
    }
    batch.rowCount = rows.length;
    batch.invalidRowCount = invalidCount;
    batch.status = DataEntryBatchStatus.READY;
    await this.db.Set(DataEntryBatches).save(batch);
  }

  private async stageCourseCsv(
    batch: DataEntryBatches,
    csvText: string,
  ): Promise<void> {
    const parsed = parseCsv(csvText);
    validateSchema(parsed, CourseImportSchema.inputHeaders);
    await this.db.Set(DataEntryCourseRows).delete({ batchId: batch.id });

    let catalogUniName: string | null = null;
    if (batch.sysUniversityId) {
      const uni = await this.db.Set(SysUniversities).findOne({
        where: { id: batch.sysUniversityId },
      });
      if (!uni) {
        throw new BadRequestException('University not found');
      }
      catalogUniName = uni.uniName;
    }

    let invalidCount = 0;
    const rows: DataEntryCourseRows[] = parsed.map((raw, idx) => {
      const fields = normalizeStagingCourseRow(raw as CsvRow);
      if (catalogUniName) {
        const csvName = (fields.uniName ?? '').trim();
        if (!csvName) {
          fields.uniName = catalogUniName;
        } else if (csvName.toLowerCase() !== catalogUniName.toLowerCase()) {
          fields.uniName = csvName;
        } else {
          fields.uniName = catalogUniName;
        }
      }
      const courseRow = normalizeCourseCsvRow(fields as CsvRow);
      const fieldErrors = this.courseValidator.validateRowFieldErrors(courseRow);
      if (
        catalogUniName &&
        (fields.uniName ?? '').trim().toLowerCase() !==
          catalogUniName.toLowerCase()
      ) {
        fieldErrors.uniName = `This CSV is for ${catalogUniName}`;
      }
      const isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);
      if (!isValid) invalidCount++;
      return this.db.Set(DataEntryCourseRows).create({
        batchId: batch.id,
        rowIndex: idx + 1,
        fields,
        fieldErrors,
        isValid,
      });
    });
    if (rows.length) {
      await this.db.Set(DataEntryCourseRows).save(rows);
    }
    batch.rowCount = rows.length;
    batch.invalidRowCount = invalidCount;
    batch.status = DataEntryBatchStatus.READY;
    await this.db.Set(DataEntryBatches).save(batch);
  }

  private async snapshotHelpers(batch: DataEntryBatches): Promise<void> {
    const docs: Partial<Record<DataEntryHelperKey, string>> = {
      ...(batch.helperDocs ?? {}),
    };
    const keys = batch.helperObjectKeys ?? {};
    for (const helperKey of DATA_ENTRY_HELPER_KEYS) {
      const publicId = keys[helperKey];
      if (!publicId) continue;
      const resolved = await this.cloudinary.resolveRawPublicId(publicId);
      if (!resolved) continue;
      docs[helperKey] = await this.cloudinary.fetchRawText(resolved);
    }
    batch.helperDocs = docs;
    await this.db.Set(DataEntryBatches).save(batch);
  }

  private normalizeHelperKeys(
    raw?: DataEntryHelperKey[],
  ): DataEntryHelperKey[] {
    if (!raw?.length) return [];
    const unknown = raw.filter((k) => !DATA_ENTRY_HELPER_KEYS.includes(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown helper keys: ${unknown.join(', ')}`,
      );
    }
    return [...new Set(raw)];
  }

  private async requireBatch(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }
}
