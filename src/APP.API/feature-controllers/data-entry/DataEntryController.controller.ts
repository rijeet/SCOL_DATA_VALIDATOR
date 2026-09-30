import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@api/common/guards/JwtAuthGuard.guard';
import { RoleGuard } from '@api/common/guards/RoleGuard.guard';
import { RequireRole } from '@api/common/decorators/RequireRole.decorator';
import { CurrentUser } from '@api/common/decorators/CurrentUser.decorator';
import { Role } from '@shared/enums/Role.enum';
import type { ICurrentUser } from '@shared/interfaces/domain';
import { DataEntryCloudCatalogService } from '@bll/services/data-entry/staging/DataEntryCloudCatalogService';
import { DataEntryStagingService } from '@bll/services/data-entry/staging/DataEntryStagingService';
import { DataEntryPublishService } from '@bll/services/data-entry/staging/DataEntryPublishService';
import { CreateDataEntryBatchRequestDto } from '@shared/dtos/data-entry/CreateDataEntryBatchRequestDto';
import { UpdateDataEntryRowRequestDto } from '@shared/dtos/data-entry/UpdateDataEntryRowRequestDto';
import type { DataEntryHelperKey } from '@shared/constants/dataEntryCloud.constants';
import type { DataEntryUniversityPackDto } from '@bll/services/data-entry/staging/DataEntryCloudCatalogService';

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
  ) {}

  @Get('universities')
  @ApiOperation({
    summary: 'List universities from sys_Universities with staging summary',
  })
  listUniversities() {
    return this.staging.listSysUniversitiesForDataEntry();
  }

  @Get('cloud/universities')
  @ApiOperation({
    summary: 'Optional: list university packs under SCOL_DATA in Cloudinary',
  })
  listCloudUniversities(): Promise<DataEntryUniversityPackDto[]> {
    return this.catalog.listUniversityPacks();
  }

  @Post('universities/sync-from-cloud')
  @ApiOperation({
    summary:
      'Optional: add sys_Universities rows for each Cloudinary SCOL_DATA folder name',
  })
  syncUniversitiesFromCloud() {
    return this.staging.syncSysUniversitiesFromCloud();
  }

  @Get('universities/:sysUniversityId/latest-batch')
  @ApiOperation({ summary: 'Latest staging batch for a sys university' })
  getLatestBatch(@Param('sysUniversityId') sysUniversityId: string) {
    return this.staging.getLatestBatchForSysUniversity(sysUniversityId);
  }

  @Get('batches')
  @ApiOperation({ summary: 'List imported batches' })
  listBatches() {
    return this.staging.listBatches();
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

  @Get('batches/:batchId/invalid-rows/adjacent')
  @ApiOperation({ summary: 'Next or previous invalid row from current index' })
  async adjacentInvalidRow(
    @Param('batchId') batchId: string,
    @Query('current') current: string,
    @Query('direction') direction: 'next' | 'prev',
  ) {
    const rowIndex = Number(current);
    if (!Number.isFinite(rowIndex) || rowIndex < 1) {
      throw new BadRequestException('current must be a positive row index');
    }
    if (direction !== 'next' && direction !== 'prev') {
      throw new BadRequestException('direction must be next or prev');
    }
    const adjacent = await this.staging.getAdjacentInvalidRowIndex(
      batchId,
      rowIndex,
      direction,
    );
    return { rowIndex: adjacent };
  }

  @Get('batches/:batchId/invalid-rows')
  @ApiOperation({ summary: 'All rowIndex values that are not valid' })
  listInvalidRows(@Param('batchId') batchId: string) {
    return this.staging.listInvalidRowIndexes(batchId);
  }

  @Get('batches/:batchId/first-invalid-row')
  @ApiOperation({ summary: 'Lowest rowIndex with validation errors, if any' })
  async getFirstInvalidRow(@Param('batchId') batchId: string) {
    const rowIndex = await this.staging.getFirstInvalidRowIndex(batchId);
    return { rowIndex };
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
    summary: 'Push validated staging rows to UniCourses / intakes / scholarships',
  })
  publishBatch(@Param('batchId') batchId: string) {
    return this.publish.publishBatchToCatalog(batchId);
  }

  @Get('batches/:batchId/rows/:rowIndex')
  getRow(
    @Param('batchId') batchId: string,
    @Param('rowIndex', ParseIntPipe) rowIndex: number,
  ) {
    return this.staging.getRow(batchId, rowIndex);
  }

  @Patch('batches/:batchId/rows/:rowIndex')
  updateRow(
    @Param('batchId') batchId: string,
    @Param('rowIndex', ParseIntPipe) rowIndex: number,
    @Body() dto: UpdateDataEntryRowRequestDto,
  ) {
    return this.staging.updateRow(batchId, rowIndex, dto.fields);
  }

  @Get('batches/:batchId')
  getBatch(@Param('batchId') batchId: string) {
    return this.staging.getBatch(batchId);
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
