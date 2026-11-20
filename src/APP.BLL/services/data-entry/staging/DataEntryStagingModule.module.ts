import { Module } from '@nestjs/common';
import { StorageModule } from '@infra/storage/StorageModule.module';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { UniversityRowValidator } from '../university/UniversityRowValidator';
import { DataEntryStagingService } from './DataEntryStagingService';
import { DataEntryPublishService } from './DataEntryPublishService';
import { DataEntryUploadService } from './DataEntryUploadService';
import { DataEntryStorageKeyBuilder } from './DataEntryStorageKeyBuilder';
import { DataEntryDashboardService } from './DataEntryDashboardService';
import { DataEntryExportService } from './DataEntryExportService';
import { DataEntryApplyFilledService } from './DataEntryApplyFilledService';
import { DataEntryUnpublishedCourseService } from './DataEntryUnpublishedCourseService';

@Module({
  imports: [StorageModule],
  providers: [
    CourseRowValidator,
    UniversityRowValidator,
    DataEntryPublishService,
    DataEntryStorageKeyBuilder,
    DataEntryUploadService,
    DataEntryDashboardService,
    DataEntryStagingService,
    DataEntryExportService,
    DataEntryApplyFilledService,
    DataEntryUnpublishedCourseService,
  ],
  exports: [
    DataEntryStagingService,
    DataEntryPublishService,
    DataEntryUploadService,
    DataEntryDashboardService,
    DataEntryExportService,
    DataEntryApplyFilledService,
    DataEntryUnpublishedCourseService,
  ],
})
export class DataEntryStagingModule {}
