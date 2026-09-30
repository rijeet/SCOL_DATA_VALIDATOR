import { Module } from '@nestjs/common';
import { DataEntryController } from './DataEntryController.controller';
import { DataEntryStagingModule } from '@bll/services/data-entry/staging/DataEntryStagingModule.module';

@Module({
  imports: [DataEntryStagingModule],
  controllers: [DataEntryController],
})
export class DataEntryModule {}
