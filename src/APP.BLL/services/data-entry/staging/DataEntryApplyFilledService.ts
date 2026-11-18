import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { CloudinaryUniversityDataService } from '@infra/cloudinary/CloudinaryUniversityData.service';
import { DataEntryBatches } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { CourseIntakeScholarships } from '@entity/entities/CourseIntakeScholarships.entity';
import { UniCourseIntakes } from '@entity/entities/UniCourseIntakes.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import {
  DATA_ENTRY_MAX_FILE_BYTES,
} from '@shared/constants/dataEntryCloud.constants';
import {
  DATA_FIX_PATCH_FIELDS,
  type DataFixPatchField,
} from '@shared/constants/courseKey.constants';
import { GenerateApplyFilledUploadUrlRequestDto } from '@shared/dtos/data-entry/GenerateApplyFilledUploadUrlRequestDto';
import { ApplyFilledCsvResultDto } from '@shared/dtos/data-entry/ApplyFilledCsvResultDto';
import { courseCommissionAmount } from '@shared/validation/courseCommissionAmount';
import { isCourseRowFieldRequired } from '@shared/validation/courseRowFieldValidation';
import { parseOptionalDecimal } from '../course/parsers/courseCsvFieldParsers';
import { parseIntakeInfoList } from '../course/parsers/courseIntakeInfoParser';
import { parseCsv } from '../common/engine/CsvParser';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { normalizeCourseCsvRow } from '../course/dto/CourseImportRowTypes';
import { normalizeStagingCourseRow } from './courseStagingHeaders';
import { DataEntryStorageKeyBuilder } from './DataEntryStorageKeyBuilder';
import { DataEntryCatalogLookup } from './DataEntryCatalogLookup';
import { DataEntryDashboardService } from './DataEntryDashboardService';
import { DataEntryStagingService } from './DataEntryStagingService';
import { ensureCourseKeys } from './assignCourseKeys';
import type { CsvRow } from '../common/abstractions/CsvImportProcessor';

@Injectable()
export class DataEntryApplyFilledService {
  constructor(
    private readonly db: AppDbContext,
    private readonly cloudinary: CloudinaryUniversityDataService,
    private readonly keys: DataEntryStorageKeyBuilder,
    private readonly courseValidator: CourseRowValidator,
    private readonly dashboard: DataEntryDashboardService,
    private readonly staging: DataEntryStagingService,
  ) {}

  async generateUploadUrl(
    batchId: string,
    dto: GenerateApplyFilledUploadUrlRequestDto,
  ) {
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
    const batch = await this.requireCourseBatch(batchId);
    if (!batch.csvObjectKey) {
      throw new ConflictException('Batch has no CSV location for filled upload');
    }
    const publicId = this.keys.filledCsvPublicId(batch.csvObjectKey);
    return {
      csv: this.cloudinary.generateSignedRawUpload(publicId),
    };
  }

  async confirmAndApply(batchId: string): Promise<ApplyFilledCsvResultDto> {
    const batch = await this.requireCourseBatch(batchId);
    if (!batch.csvObjectKey) {
      throw new ConflictException('Batch has no CSV location');
    }
    const publicId = this.keys.filledCsvPublicId(batch.csvObjectKey);
    const resolved = await this.cloudinary.resolveRawPublicId(publicId);
    if (!resolved) {
      throw new BadRequestException(
        'Filled CSV not found in Cloudinary. Upload it first.',
      );
    }
    const csvText = await this.cloudinary.fetchRawText(resolved);
    return this.applyCsvText(batch, csvText);
  }

  async applyCsvText(
    batch: DataEntryBatches,
    csvText: string,
  ): Promise<ApplyFilledCsvResultDto> {
    const parsed = parseCsv(csvText);
    if (parsed.length === 0) {
      throw new BadRequestException('Filled CSV has no data rows');
    }
    const headers = Object.keys(parsed[0] ?? {});
    if (!headers.includes('courseKey')) {
      throw new BadRequestException(
        'Filled CSV must include a courseKey column',
      );
    }

    const result: ApplyFilledCsvResultDto = {
      updated: 0,
      catalogUpdated: 0,
      skipped: [],
    };

    await this.db.transaction(async (manager) => {
      await ensureCourseKeys(manager, batch);
      const rows = await manager.find(DataEntryCourseRows, {
        where: { batchId: batch.id },
      });
      const byKey = new Map<string, DataEntryCourseRows>();
      for (const row of rows) {
        const key = (row.fields.courseKey ?? '').trim().toLowerCase();
        if (key) byKey.set(key, row);
      }

      const uniCommission =
        await this.staging.getUniversityCommissionForBatch(batch);
      const uniId = await this.resolveUniId(manager, batch);
      const lookup = new DataEntryCatalogLookup(manager);
      const seen = new Set<string>();

      for (const raw of parsed) {
        const incomingKey = String(raw.courseKey ?? '').trim().toLowerCase();
        if (!incomingKey) {
          result.skipped.push({
            courseKey: '',
            reason: 'courseKey is required',
          });
          continue;
        }
        if (seen.has(incomingKey)) {
          result.skipped.push({
            courseKey: incomingKey,
            reason: 'duplicate courseKey in file',
          });
          continue;
        }
        seen.add(incomingKey);
        const row = byKey.get(incomingKey);
        if (!row) {
          result.skipped.push({
            courseKey: incomingKey,
            reason: 'unknown courseKey',
          });
          continue;
        }

        const patch = this.patchFromFilled(raw, row.fields);
        if (!patch.changed) continue;

        const merged = { ...row.fields, ...patch.next };
        if (uniCommission) {
          merged.commission = courseCommissionAmount({
            commissionType: uniCommission.commissionType,
            commission: uniCommission.commission,
            tuitionFee: merged.tuitionFee ?? '',
          });
        }
        const normalized = normalizeStagingCourseRow(merged as CsvRow);
        normalized.courseKey = incomingKey;
        const courseRow = normalizeCourseCsvRow(normalized as CsvRow);
        const fieldErrors =
          this.courseValidator.validateRowFieldErrors(courseRow);
        row.fields = normalized;
        row.fieldErrors = fieldErrors;
        row.isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);
        await manager.save(DataEntryCourseRows, row);
        result.updated += 1;

        if (!uniId) continue;
        const catalogChanged = await this.patchCatalog(
          manager,
          lookup,
          uniId,
          incomingKey,
          patch.next,
        );
        if (catalogChanged) result.catalogUpdated += 1;
      }
    });

    await this.staging.recomputeBatchCounts(batch.id);
    if (result.updated > 0 || result.catalogUpdated > 0) {
      await this.dashboard.refresh(batch.createdByUserId ?? batch.id);
    }
    return result;
  }

  private patchFromFilled(
    raw: CsvRow,
    current: Record<string, string>,
  ): { changed: boolean; next: Record<string, string> } {
    const next: Record<string, string> = {};
    let changed = false;
    for (const field of DATA_FIX_PATCH_FIELDS) {
      const incoming = String(raw[field] ?? '').trim();
      if (!incoming) continue;
      const existing = (current[field] ?? '').trim();
      if (incoming === existing) continue;
      next[field] = incoming;
      changed = true;
    }
    return { changed, next };
  }

  private async patchCatalog(
    manager: EntityManager,
    lookup: DataEntryCatalogLookup,
    uniId: string,
    courseKey: string,
    patch: Partial<Record<DataFixPatchField, string>>,
  ): Promise<boolean> {
    const course = await manager
      .createQueryBuilder(UniCourses, 'c')
      .where('c.uniId = :uniId', { uniId })
      .andWhere('lower(trim(c.courseKey)) = :courseKey', { courseKey })
      .andWhere('c.deletedAt IS NULL')
      .getOne();
    if (!course) return false;

    let changed = false;
    if (patch.programmeName) {
      course.sysProgrammeId = await lookup.programme(patch.programmeName);
      changed = true;
    }
    if (patch.degreeName) {
      course.sysDegreeId = await lookup.degree(patch.degreeName);
      changed = true;
    }
    if (changed) {
      await manager.save(UniCourses, course);
    }
    if (patch.intakeInfo) {
      const intakesChanged = await this.syncCatalogIntakes(
        manager,
        course.id,
        patch.intakeInfo,
        patch.tuitionFee,
      );
      if (intakesChanged) changed = true;
    }
    if (patch.tuitionFee) {
      const tuition = parseOptionalDecimal(patch.tuitionFee);
      if (tuition) {
        await manager
          .createQueryBuilder()
          .update(UniCourseIntakes)
          .set({ tuitionFee: tuition })
          .where('"uniCourseId" = :courseId', { courseId: course.id })
          .andWhere('"deletedAt" IS NULL')
          .andWhere('"isActive" = true')
          .execute();
        changed = true;
      }
    }
    return changed;
  }

  private async syncCatalogIntakes(
    manager: EntityManager,
    courseId: string,
    intakeInfo: string,
    tuitionFee?: string,
  ): Promise<boolean> {
    const intakes = parseIntakeInfoList(intakeInfo);
    if (intakes.length === 0) return false;

    const sibling = await manager.findOne(UniCourseIntakes, {
      where: { uniCourseId: courseId, isActive: true },
    });
    const tuition =
      parseOptionalDecimal(tuitionFee ?? '') ?? sibling?.tuitionFee;
    const keptIds: string[] = [];
    let changed = false;

    for (const intake of intakes) {
      const existing = await manager
        .createQueryBuilder(UniCourseIntakes, 'i')
        .withDeleted()
        .where('i.uniCourseId = :cid', { cid: courseId })
        .andWhere('i.intakeYear = :year', { year: intake.year })
        .andWhere('i.intakeMonth = :month', { month: intake.month })
        .getOne();
      if (existing) {
        const wasGone = Boolean(existing.deletedAt) || !existing.isActive;
        existing.deletedAt = null;
        existing.isActive = true;
        existing.intakeYear = intake.year;
        existing.intakeMonth = intake.month;
        await manager.save(UniCourseIntakes, existing);
        keptIds.push(existing.id);
        if (wasGone) changed = true;
      } else {
        const created = await manager.save(
          UniCourseIntakes,
          manager.create(UniCourseIntakes, {
            uniCourseId: courseId,
            intakeYear: intake.year,
            intakeMonth: intake.month,
            courseDuration: sibling?.courseDuration,
            applicationDeadline: sibling?.applicationDeadline,
            tuitionFee: tuition,
            currency: sibling?.currency,
            initialDeposit: sibling?.initialDeposit,
            applicationFee: sibling?.applicationFee,
            isActive: true,
          }),
        );
        if (sibling) {
          const scholarships = await manager.find(CourseIntakeScholarships, {
            where: { courseIntakeId: sibling.id },
          });
          for (const s of scholarships) {
            await manager.save(
              CourseIntakeScholarships,
              manager.create(CourseIntakeScholarships, {
                courseIntakeId: created.id,
                name: s.name,
                amount: s.amount,
                amountType: s.amountType,
                isActive: s.isActive,
              }),
            );
          }
        }
        keptIds.push(created.id);
        changed = true;
      }
    }

    if (keptIds.length === 0) return changed;

    const extras = await manager
      .createQueryBuilder(UniCourseIntakes, 'i')
      .where('i.uniCourseId = :cid', { cid: courseId })
      .andWhere('i.deletedAt IS NULL')
      .andWhere('i.id NOT IN (:...ids)', { ids: keptIds })
      .getMany();
    for (const extra of extras) {
      await manager.softDelete(UniCourseIntakes, extra.id);
      changed = true;
    }
    return changed;
  }

  private async resolveUniId(
    manager: EntityManager,
    batch: DataEntryBatches,
  ): Promise<string | null> {
    if (batch.sysUniversityId) return batch.sysUniversityId;
    const key = (batch.universityKey ?? '').trim();
    if (!key) return null;
    const uni = await manager
      .createQueryBuilder(SysUniversities, 'u')
      .where('lower(trim(u.uniName)) = :n', { n: key.toLowerCase() })
      .andWhere('u.deletedAt IS NULL')
      .getOne();
    return uni?.id ?? null;
  }

  private async requireCourseBatch(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.batchType !== DataEntryBatchType.COURSE) {
      throw new BadRequestException(
        'Filled CSV can only be applied to a course batch',
      );
    }
    return batch;
  }
}
