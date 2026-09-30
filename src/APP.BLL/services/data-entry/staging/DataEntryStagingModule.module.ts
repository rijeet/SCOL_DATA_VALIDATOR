import { Module } from '@nestjs/common';
import { CloudinaryModule } from '@infra/cloudinary/CloudinaryModule.module';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { DataEntryCloudCatalogService } from './DataEntryCloudCatalogService';
import { DataEntryStagingService } from './DataEntryStagingService';
import { DataEntryPublishService } from './DataEntryPublishService';

@Module({
  imports: [CloudinaryModule],
  providers: [
    CourseRowValidator,
    DataEntryCloudCatalogService,
    DataEntryPublishService,
    DataEntryStagingService,
  ],
  exports: [
    DataEntryCloudCatalogService,
    DataEntryStagingService,
    DataEntryPublishService,
  ],
})
export class DataEntryStagingModule {}
