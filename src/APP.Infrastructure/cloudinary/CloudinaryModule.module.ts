import { Module } from '@nestjs/common';
import { CloudinaryUniversityDataService } from './CloudinaryUniversityData.service';

@Module({
  providers: [CloudinaryUniversityDataService],
  exports: [CloudinaryUniversityDataService],
})
export class CloudinaryModule {}
