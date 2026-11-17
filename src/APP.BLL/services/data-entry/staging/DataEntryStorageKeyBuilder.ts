import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import {
  DATA_ENTRY_CLOUD_ROOT_DEFAULT,
  type DataEntryHelperKey,
} from '@shared/constants/dataEntryCloud.constants';

@Injectable()
export class DataEntryStorageKeyBuilder {
  constructor(private readonly config: ConfigService) {}

  private get rootFolder(): string {
    const raw =
      this.config.get<string>('DATA_ENTRY_CLOUD_ROOT') ??
      DATA_ENTRY_CLOUD_ROOT_DEFAULT;
    return raw.replace(/^\/+|\/+$/g, '');
  }

  csvPublicId(
    countryCode: string,
    type: DataEntryBatchType,
    batchId: string,
    uniSlug?: string,
  ): string {
    return `${this.prefix(countryCode, type, batchId, uniSlug)}/original.csv`;
  }

  helperPublicId(
    countryCode: string,
    type: DataEntryBatchType,
    batchId: string,
    helperKey: DataEntryHelperKey,
    uniSlug?: string,
  ): string {
    return `${this.prefix(countryCode, type, batchId, uniSlug)}/helpers/${helperKey}.md`;
  }

  private prefix(
    countryCode: string,
    type: DataEntryBatchType,
    batchId: string,
    uniSlug?: string,
  ): string {
    const folder =
      type === DataEntryBatchType.UNIVERSITY ? 'universities' : 'courses';
    if (type === DataEntryBatchType.COURSE && uniSlug) {
      return `${this.rootFolder}/${countryCode}/${folder}/${uniSlug}/${batchId}`;
    }
    return `${this.rootFolder}/${countryCode}/${folder}/${batchId}`;
  }
}
