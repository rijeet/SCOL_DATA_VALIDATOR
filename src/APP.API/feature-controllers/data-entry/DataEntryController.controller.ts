import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@api/common/guards/JwtAuthGuard.guard';
import { RoleGuard } from '@api/common/guards/RoleGuard.guard';
import { RequireRole } from '@api/common/decorators/RequireRole.decorator';
import { CurrentUser } from '@api/common/decorators/CurrentUser.decorator';
import { Role } from '@shared/enums/Role.enum';
import type { ICurrentUser } from '@shared/interfaces/domain';
import { DataEntryCloudCatalogService } from '@bll/services/data-entry/staging/DataEntryCloudCatalogService';
import { DataEntryStagingService } from '@bll/services/data-entry/staging/DataEntryStagingService';
import { DataEntryPublishService } from '@bll/services/data-entry/staging/DataEntryPublishService';
import { DataEntryUploadService } from '@bll/services/data-entry/staging/DataEntryUploadService';
import { DataEntryDashboardService } from '@bll/services/data-entry/staging/DataEntryDashboardService';
import { DataEntryExportService } from '@bll/services/data-entry/staging/DataEntryExportService';
import { DataEntryApplyFilledService } from '@bll/services/data-entry/staging/DataEntryApplyFilledService';
import { DataEntryUnpublishedCourseService } from '@bll/services/data-entry/staging/DataEntryUnpublishedCourseService';
import {
  RemapUnpublishedEnglishScoresRequestDto,
  RemapUnpublishedTuitionRequestDto,
  RemapUnpublishedEntryDegreesRequestDto,
  RemapUnpublishedIntakesRequestDto,
  RemapUnpublishedScholarshipsRequestDto,
  RenameUnpublishedProgrammeRequestDto,
} from '@shared/dtos/data-entry/RemapUnpublishedCourseRequestDto';
import { GenerateApplyFilledUploadUrlRequestDto } from '@shared/dtos/data-entry/GenerateApplyFilledUploadUrlRequestDto';
import { CreateDataEntryBatchRequestDto } from '@shared/dtos/data-entry/CreateDataEntryBatchRequestDto';
import { UpdateDataEntryRowRequestDto } from '@shared/dtos/data-entry/UpdateDataEntryRowRequestDto';
import { GenerateDataEntryUploadUrlRequestDto } from '@shared/dtos/data-entry/GenerateDataEntryUploadUrlRequestDto';
import { ConfirmUniversityImageUploadRequestDto } from '@shared/dtos/data-entry/ConfirmUniversityImageUploadRequestDto';
import { GenerateUniversityImageUploadUrlRequestDto } from '@shared/dtos/data-entry/GenerateUniversityImageUploadUrlRequestDto';
import { ApplyToeflScaleRequestDto } from '@shared/dtos/data-entry/ApplyToeflScaleRequestDto';
import { RemapDashboardEntryDegreesRequestDto } from '@shared/dtos/data-entry/RemapDashboardEntryDegreesRequestDto';
import {
  RemapDashboardEnglishScoresRequestDto,
  RemapDashboardIntakesRequestDto,
  RemapDashboardTuitionRequestDto,
} from '@shared/dtos/data-entry/RemapDashboardIntakesRequestDto';
import { RemapDashboardScholarshipsRequestDto } from '@shared/dtos/data-entry/RemapDashboardScholarshipsRequestDto';
import { RenameDashboardProgrammeRequestDto } from '@shared/dtos/data-entry/RenameDashboardProgrammeRequestDto';
import {
  DATA_ENTRY_HELPER_KEYS,
  type DataEntryHelperKey,
} from '@shared/constants/dataEntryCloud.constants';
@ApiTags('data-entry')
@Controller('data-entry')
@UseGuards(JwtAuthGuard, RoleGuard)
@RequireRole(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
export class DataEntryController {
  constructor(
    private readonly catalog: DataEntryCloudCatalogService,
    private readonly staging: DataEntryStagingService,
    private readonly publish: DataEntryPublishService,
    private readonly upload: DataEntryUploadService,
    private readonly dashboard: DataEntryDashboardService,
    private readonly exportService: DataEntryExportService,
    private readonly applyFilled: DataEntryApplyFilledService,
    private readonly unpublished: DataEntryUnpublishedCourseService,
  ) {}

  @Get('destinations')
  @ApiOperation({ summary: 'List destination countries with batch counts' })
  listDestinations() {
    return this.upload.listDestinations();
  }

  @Get('destinations/:countryId/batches')
  @ApiOperation({ summary: 'List staging batches for a destination country' })
  listCountryBatches(@Param('countryId', ParseUUIDPipe) countryId: string) {
    return this.upload.listCountryBatches(countryId);
  }

  @Get('destinations/:countryId/universities')
  @ApiOperation({
    summary: 'Published universities for a destination with latest course batch',
  })
  listCountryUniversities(
    @Param('countryId', ParseUUIDPipe) countryId: string,
  ) {
    return this.upload.listCountryUniversities(countryId);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Last dashboard snapshot (no catalog scan)' })
  getDashboard() {
    return this.dashboard.getSnapshot();
  }

  @Get('dashboard/degrees/:degreeId/courses')
  @ApiOperation({
    summary:
      'Catalog courses for an awarded degree, with staging row links when present',
  })
  listDashboardDegreeCourses(
    @Param('degreeId', ParseUUIDPipe) degreeId: string,
    @Query('countryId') countryId?: string,
  ) {
    return this.dashboard.listCoursesForDegree(degreeId, countryId);
  }

  @Post('dashboard/refresh')
  @ApiOperation({
    summary: 'Rebuild dashboard snapshot from catalog tables',
  })
  refreshDashboard(@CurrentUser() user: ICurrentUser) {
    return this.dashboard.refresh(user.userId);
  }

  @Get('dashboard/intakes/courses')
  @ApiOperation({
    summary:
      'Catalog courses at a university for one intake, with staging row links',
  })
  listDashboardIntakeCourses(
    @Query('uniId', ParseUUIDPipe) uniId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.dashboard.listCoursesForIntake(uniId, year, month);
  }

  @Post('dashboard/intakes/remap')
  @ApiOperation({
    summary:
      'Move one intake month/year to another for every course at a university',
  })
  remapDashboardIntakes(@Body() dto: RemapDashboardIntakesRequestDto) {
    return this.dashboard.remapIntakes(dto);
  }

  @Post('dashboard/courses/entry-degrees')
  @ApiOperation({
    summary:
      'Change min/high entry degrees for every matching course at a university',
  })
  remapDashboardEntryDegrees(
    @Body() dto: RemapDashboardEntryDegreesRequestDto,
  ) {
    return this.dashboard.remapEntryDegrees(dto);
  }

  @Get('dashboard/english-tests/:testId/courses')
  @ApiOperation({
    summary: 'Catalog courses that require this English test, with the score',
  })
  listDashboardEnglishTestCourses(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Query('uniId') uniId?: string,
    @Query('overall') overall?: string,
    @Query('section') section?: string,
  ) {
    return this.dashboard.listCoursesForEnglishTest(testId, {
      uniId,
      overall,
      section,
    });
  }

  @Post('dashboard/english-tests/remap')
  @ApiOperation({
    summary:
      'Change one English overall/section score for matching courses at a university',
  })
  remapDashboardEnglishScores(
    @Body() dto: RemapDashboardEnglishScoresRequestDto,
  ) {
    return this.dashboard.remapEnglishScores(dto);
  }

  @Get('dashboard/english-tests/toefl-preview')
  @ApiOperation({ summary: 'Distinct old TOEFL scores and the suggested 1–6 map' })
  dashboardToeflPreview() {
    return this.dashboard.toeflPreview();
  }

  @Post('dashboard/english-tests/toefl-scale')
  @ApiOperation({ summary: 'Apply a reviewed TOEFL 1–6 map to catalog and course rows' })
  applyDashboardToeflScale(@Body() dto: ApplyToeflScaleRequestDto) {
    return this.dashboard.applyToeflScale(dto);
  }

  @Get('dashboard/tuition/courses')
  @ApiOperation({
    summary: 'Catalog courses at a university with this tuition fee',
  })
  listDashboardTuitionCourses(
    @Query('uniId', ParseUUIDPipe) uniId: string,
    @Query('currency') currency?: string,
    @Query('amount') amount?: string,
    @Query('year', ParseIntPipe) year?: number,
    @Query('month', ParseIntPipe) month?: number,
  ) {
    return this.dashboard.listCoursesForTuition({
      uniId,
      currency: currency ?? '',
      amount: amount ?? '',
      year: year ?? 0,
      month: month ?? 0,
    });
  }

  @Post('dashboard/tuition/remap')
  @ApiOperation({
    summary: 'Change one tuition amount and currency for a university',
  })
  remapDashboardTuition(@Body() dto: RemapDashboardTuitionRequestDto) {
    return this.dashboard.remapTuition(dto);
  }

  @Get('dashboard/programmes/:programmeId/courses')
  @ApiOperation({
    summary: 'Catalog courses for a programme, with staging row links',
  })
  listDashboardProgrammeCourses(
    @Param('programmeId', ParseUUIDPipe) programmeId: string,
  ) {
    return this.dashboard.listCoursesForProgramme(programmeId);
  }

  @Get('dashboard/scholarships/courses')
  @ApiOperation({
    summary:
      'Catalog courses matching one scholarship at a university, with staging row links',
  })
  listDashboardScholarshipCourses(
    @Query('uniId', ParseUUIDPipe) uniId: string,
    @Query('degreeId', ParseUUIDPipe) degreeId: string,
    @Query('name') name?: string,
    @Query('amount') amount?: string,
    @Query('amountType') amountType?: string,
  ) {
    return this.dashboard.listCoursesForScholarship({
      uniId,
      degreeId,
      name,
      amount,
      amountType,
    });
  }

  @Post('dashboard/programmes/rename')
  @ApiOperation({
    summary:
      'Rename a programme for every university that uses it (merge if the name exists)',
  })
  renameDashboardProgramme(@Body() dto: RenameDashboardProgrammeRequestDto) {
    return this.dashboard.renameProgramme(dto);
  }

  @Post('dashboard/scholarships/remap')
  @ApiOperation({
    summary:
      'Assign or change a scholarship for matching courses at a university',
  })
  remapDashboardScholarships(
    @Body() dto: RemapDashboardScholarshipsRequestDto,
  ) {
    return this.dashboard.remapScholarships(dto);
  }

  @Get('unpublished/snapshot')
  @ApiOperation({
    summary: 'Cards for the latest unpublished course batch of each university',
  })
  unpublishedSnapshot() {
    return this.unpublished.snapshot();
  }

  @Get('unpublished/degrees/:degreeName/courses')
  @ApiOperation({
    summary: 'Unpublished course rows for an awarded degree name',
  })
  unpublishedDegreeCourses(@Param('degreeName') degreeName: string) {
    return this.unpublished.listCourses(decodeURIComponent(degreeName));
  }

  @Post('unpublished/courses/entry-degrees')
  @ApiOperation({
    summary: 'Set min/high degree names on matching unpublished course rows',
  })
  remapUnpublishedEntryDegrees(
    @Body() dto: RemapUnpublishedEntryDegreesRequestDto,
  ) {
    return this.unpublished.remapEntryDegrees(dto);
  }

  @Get('unpublished/english-tests/courses')
  @ApiOperation({
    summary: 'Unpublished course rows that have a score for this English test',
  })
  unpublishedEnglishTestCourses(
    @Query('name') name?: string,
    @Query('batchId') batchId?: string,
    @Query('overall') overall?: string,
    @Query('section') section?: string,
  ) {
    return this.unpublished.listCoursesForEnglishTest(name ?? '', {
      batchId,
      overall,
      section,
    });
  }

  @Post('unpublished/english-tests/remap')
  @ApiOperation({
    summary:
      'Change one English overall/section score on matching unpublished course rows',
  })
  remapUnpublishedEnglishScores(
    @Body() dto: RemapUnpublishedEnglishScoresRequestDto,
  ) {
    return this.unpublished.remapEnglishScores(dto);
  }

  @Get('unpublished/english-tests/toefl-preview')
  @ApiOperation({ summary: 'Distinct old TOEFL scores on unpublished course rows' })
  unpublishedToeflPreview() {
    return this.unpublished.toeflPreview();
  }

  @Post('unpublished/english-tests/toefl-scale')
  @ApiOperation({ summary: 'Apply a reviewed TOEFL 1–6 map to unpublished course rows' })
  applyUnpublishedToeflScale(@Body() dto: ApplyToeflScaleRequestDto) {
    return this.unpublished.applyToeflScale(dto);
  }

  @Get('unpublished/tuition/courses')
  @ApiOperation({
    summary: 'Unpublished course rows with this tuition fee',
  })
  unpublishedTuitionCourses(
    @Query('batchId', ParseUUIDPipe) batchId: string,
    @Query('currency') currency?: string,
    @Query('amount') amount?: string,
    @Query('year', ParseIntPipe) year?: number,
    @Query('month', ParseIntPipe) month?: number,
  ) {
    return this.unpublished.listCoursesForTuition({
      batchId,
      currency: currency ?? '',
      amount: amount ?? '',
      year: year ?? 0,
      month: month ?? 0,
    });
  }

  @Post('unpublished/tuition/remap')
  @ApiOperation({
    summary: 'Change tuition on matching unpublished course rows',
  })
  remapUnpublishedTuition(@Body() dto: RemapUnpublishedTuitionRequestDto) {
    return this.unpublished.remapTuition(dto);
  }

  @Get('unpublished/programmes/courses')
  @ApiOperation({
    summary: 'Unpublished course rows with this programme name',
  })
  unpublishedProgrammeCourses(@Query('name') name?: string) {
    return this.unpublished.listCoursesForProgramme(name ?? '');
  }

  @Get('unpublished/scholarships/courses')
  @ApiOperation({
    summary: 'Unpublished course rows matching one scholarship',
  })
  unpublishedScholarshipCourses(
    @Query('batchId', ParseUUIDPipe) batchId: string,
    @Query('degreeName') degreeName?: string,
    @Query('name') name?: string,
    @Query('amount') amount?: string,
    @Query('amountType') amountType?: string,
  ) {
    return this.unpublished.listCoursesForScholarship({
      batchId,
      degreeName: degreeName ?? '',
      name,
      amount,
      amountType,
    });
  }

  @Post('unpublished/programmes/rename')
  @ApiOperation({
    summary: 'Rename programmeName on matching unpublished course rows',
  })
  renameUnpublishedProgramme(@Body() dto: RenameUnpublishedProgrammeRequestDto) {
    return this.unpublished.renameProgramme(dto);
  }

  @Post('unpublished/scholarships/remap')
  @ApiOperation({
    summary: 'Change scholarship fields on matching unpublished course rows',
  })
  remapUnpublishedScholarships(
    @Body() dto: RemapUnpublishedScholarshipsRequestDto,
  ) {
    return this.unpublished.remapScholarships(dto);
  }

  @Get('unpublished/intakes/courses')
  @ApiOperation({
    summary: 'Unpublished course rows whose intakeInfo includes this month',
  })
  unpublishedIntakeCourses(
    @Query('batchId', ParseUUIDPipe) batchId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.unpublished.listCoursesForIntake(batchId, year, month);
  }

  @Post('unpublished/intakes/remap')
  @ApiOperation({
    summary: 'Rewrite one intake label on unpublished course rows',
  })
  remapUnpublishedIntakes(@Body() dto: RemapUnpublishedIntakesRequestDto) {
    return this.unpublished.remapIntakes(dto);
  }

  @Get('universities')
  @ApiOperation({
    summary: 'List universities from sys_Universities with staging summary',
  })
  listUniversities() {
    return this.staging.listSysUniversitiesForDataEntry();
  }

  @Post('universities/sync-from-cloud')
  @ApiOperation({
    summary:
      'Optional: add sys_Universities rows for each Cloudinary SCOL_DATA folder name',
  })
  syncUniversitiesFromCloud() {
    return this.staging.syncSysUniversitiesFromCloud();
  }

  @Post('batches/upload-url')
  @ApiOperation({
    summary:
      'Create a batch and return signed Cloudinary raw-upload params (CSV + helpers)',
  })
  generateUploadUrl(
    @Body() dto: GenerateDataEntryUploadUrlRequestDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.upload.generateUploadUrl(user.userId, dto);
  }

  @Delete('batches/:batchId')
  @ApiOperation({
    summary: 'Remove a failed or incomplete Cloudinary upload batch',
  })
  discardBatch(@Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.upload.discardBatch(batchId);
  }

  @Post('batches/:batchId/university-image-upload-url')
  @ApiOperation({
    summary:
      'Presigned PUT URL for university logo or cover on the public scol-assets bucket',
  })
  generateUniversityImageUploadUrl(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: GenerateUniversityImageUploadUrlRequestDto,
  ) {
    return this.upload.generateUniversityImageUploadUrl(batchId, dto);
  }

  @Post('batches/:batchId/university-image-confirm')
  @ApiOperation({
    summary:
      'HEAD the uploaded logo/cover in scol-assets and return the public file URL',
  })
  confirmUniversityImageUpload(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: ConfirmUniversityImageUploadRequestDto,
  ) {
    return this.upload.confirmUniversityImageUpload(batchId, dto);
  }

  @Post('batches/:batchId/confirm-upload')
  @ApiOperation({
    summary:
      'Read CSV + helpers from Cloudinary and stage rows after browser upload',
  })
  confirmUpload(@Param('batchId') batchId: string) {
    return this.upload.confirmUpload(batchId);
  }

  @Post('batches')
  @ApiOperation({
    summary: 'Import CSV from cloud into staging rows (validated)',
  })
  async createBatch(
    @Body() dto: CreateDataEntryBatchRequestDto,
    @CurrentUser() user: ICurrentUser,
    @Query('replaceExisting') replaceExisting?: string,
  ) {
    const fromCloud = dto.fromCloud !== false;
    const replace = replaceExisting === 'true' || replaceExisting === '1';
    let batch;
    if (dto.sysUniversityId) {
      if (!fromCloud) {
        throw new BadRequestException(
          'Only Cloudinary import is supported for new batches (fromCloud=true).',
        );
      }
      batch = await this.staging.importFromCloudForSysUniversity(
        dto.sysUniversityId,
        user.userId,
        { replaceExisting: replace },
      );
    } else if (dto.universityKey) {
      batch = await this.staging.importFromCloud(
        dto.universityKey,
        user.userId,
      );
    } else {
      throw new BadRequestException('sysUniversityId is required');
    }
    return {
      message: 'Batch imported.',
      batchId: batch.id,
      rowCount: batch.rowCount,
      invalidRowCount: batch.invalidRowCount,
    };
  }

  @Get('batches/:batchId/export.csv')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary:
      'Stream staging CSV. Default: valid rows only. DATA_ENTRY_EXPORT_ALL_ROWS=true exports every row. format=data-fix: all course rows.',
  })
  async exportValidCsv(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query('format') format?: string,
  ): Promise<StreamableFile> {
    const { stream, filename } =
      await this.exportService.openValidCsvStream(batchId, format);
    return new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('batches/:batchId/apply-filled-upload-url')
  @ApiOperation({
    summary:
      'Signed Cloudinary upload for a DATA FIX 4_col_filled CSV (does not replace the batch)',
  })
  generateApplyFilledUploadUrl(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: GenerateApplyFilledUploadUrlRequestDto,
  ) {
    return this.applyFilled.generateUploadUrl(batchId, dto);
  }

  @Post('batches/:batchId/apply-filled-confirm')
  @ApiOperation({
    summary:
      'Read the uploaded 4_col_filled CSV and patch staging + catalog by courseKey',
  })
  confirmApplyFilled(@Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.applyFilled.confirmAndApply(batchId);
  }

  @Get('batches/:batchId/invalid-rows')
  @ApiOperation({
    summary:
      'Sorted rowIndex values that are not valid (use [0] for first issue)',
  })
  listInvalidRows(@Param('batchId') batchId: string) {
    return this.staging.listInvalidRowIndexes(batchId);
  }

  @Get('batches/:batchId/publish-readiness')
  @ApiOperation({
    summary:
      'Whether all staging rows are valid and catalog tables are ready to receive publish',
  })
  getPublishReadiness(@Param('batchId') batchId: string) {
    return this.publish.getPublishReadiness(batchId);
  }

  @Post('batches/:batchId/publish')
  @ApiOperation({
    summary: 'Push validated staging rows to catalog tables',
  })
  publishBatch(@Param('batchId') batchId: string) {
    return this.publish.publishBatchToCatalog(batchId);
  }

  @Post('batches/:batchId/revalidate')
  @ApiOperation({ summary: 'Re-run validation on every staging row' })
  revalidateBatch(@Param('batchId') batchId: string) {
    return this.staging.revalidateBatch(batchId);
  }

  @Get('batches/:batchId/guide/:helperKey')
  @ApiOperation({
    summary: 'Helper markdown from batch snapshot or Cloudinary public_id',
  })
  getBatchGuide(
    @Param('batchId') batchId: string,
    @Param('helperKey') helperKey: string,
  ) {
    if (!DATA_ENTRY_HELPER_KEYS.includes(helperKey as DataEntryHelperKey)) {
      throw new BadRequestException(`Unknown helper "${helperKey}"`);
    }
    return this.upload.getGuide(batchId, helperKey as DataEntryHelperKey);
  }

  @Get('batches/:batchId')
  @ApiOperation({ summary: 'Batch metadata (counts, status, university key)' })
  async getBatch(@Param('batchId') batchId: string) {
    const batch = await this.staging.getBatch(batchId);
    const uniCommission =
      await this.staging.getUniversityCommissionForBatch(batch);
    return {
      ...batch,
      countryCode: batch.SysCountry?.countryCode ?? null,
      countryName: batch.SysCountry?.countryName ?? null,
      uniCommission: uniCommission?.commission ?? null,
      uniCommissionType: uniCommission?.commissionType ?? null,
    };
  }

  @Get('batches/:batchId/rows/:rowIndex')
  @ApiOperation({ summary: 'Single staging row with fieldErrors' })
  getRow(
    @Param('batchId') batchId: string,
    @Param('rowIndex', ParseIntPipe) rowIndex: number,
  ) {
    return this.staging.getRow(batchId, rowIndex);
  }

  @Patch('batches/:batchId/rows/:rowIndex')
  @ApiOperation({ summary: 'Update row fields and re-validate' })
  updateRow(
    @Param('batchId') batchId: string,
    @Param('rowIndex', ParseIntPipe) rowIndex: number,
    @Body() dto: UpdateDataEntryRowRequestDto,
  ) {
    return this.staging.updateRow(batchId, rowIndex, dto.fields);
  }

  @Get('universities/:universityKey/helpers/:helperKey')
  @ApiOperation({ summary: 'Read helper markdown from cloud for a university' })
  async getHelper(
    @Param('universityKey') universityKey: string,
    @Param('helperKey') helperKey: DataEntryHelperKey,
  ) {
    const markdown = await this.catalog.readHelperMarkdown(
      universityKey,
      helperKey,
    );
    return { helperKey, markdown };
  }
}
