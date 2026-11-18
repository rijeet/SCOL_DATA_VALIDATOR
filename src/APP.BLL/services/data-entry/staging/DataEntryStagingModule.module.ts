import { Module } from '@nestjs/common';
import { CloudinaryModule } from '@infra/cloudinary/CloudinaryModule.module';
import { StorageModule } from '@infra/storage/StorageModule.module';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { UniversityRowValidator } from '../university/UniversityRowValidator';
import { DataEntryCloudCatalogService } from './DataEntryCloudCatalogService';
import { DataEntryStagingService } from './DataEntryStagingService';
import { DataEntryPublishService } from './DataEntryPublishService';
import { DataEntryUploadService } from './DataEntryUploadService';
import { DataEntryStorageKeyBuilder } from './DataEntryStorageKeyBuilder';
import { DataEntryDashboardService } from './DataEntryDashboardService';
import { DataEntryExportService } from './DataEntryExportService';
import { DataEntryApplyFilledService } from './DataEntryApplyFilledService';

@Module({
  imports: [CloudinaryModule, StorageModule],
  providers: [
    CourseRowValidator,
    UniversityRowValidator,
    DataEntryCloudCatalogService,
    DataEntryPublishService,
    DataEntryStorageKeyBuilder,
    DataEntryUploadService,
    DataEntryDashboardService,
    DataEntryStagingService,
    DataEntryExportService,
    DataEntryApplyFilledService,
  ],
  exports: [
    DataEntryCloudCatalogService,
    DataEntryStagingService,
    DataEntryPublishService,
    DataEntryUploadService,
    DataEntryDashboardService,
    DataEntryExportService,
    DataEntryApplyFilledService,
  ],
})
export class DataEntryStagingModule {}
