import { Module } from '@nestjs/common';
import { BackblazeStorageService } from './backblaze/BackblazeStorageService';
import { PublicAssetStorageService } from './backblaze/PublicAssetStorageService';
import { IStorageService } from '@shared/tokens/injection.tokens';

/**
 * Storage Module (Infrastructure)
 *
 * Private scol-data via IStorageService; public scol-assets via
 * PublicAssetStorageService (university logo/cover).
 */
@Module({
  providers: [
    {
      provide: IStorageService,
      useClass: BackblazeStorageService,
    },
    PublicAssetStorageService,
  ],
  exports: [IStorageService, PublicAssetStorageService],
})
export class StorageModule {}
