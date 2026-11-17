import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { DATA_ENTRY_HELPER_KEYS } from '@shared/constants/dataEntryCloud.constants';
import type { DataEntryHelperKey } from '@shared/constants/dataEntryCloud.constants';

export class GenerateDataEntryUploadUrlRequestDto {
  @ApiProperty()
  @IsUUID()
  sysCountryId!: string;

  @ApiProperty({ enum: DataEntryBatchType })
  @IsEnum(DataEntryBatchType)
  type!: DataEntryBatchType;

  @ApiProperty({ example: 'universities.csv' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: 102400 })
  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  fileSizeBytes!: number;

  @ApiPropertyOptional({
    description: 'Required when type is COURSE; published university to attach',
  })
  @IsOptional()
  @IsUUID()
  sysUniversityId?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: DATA_ENTRY_HELPER_KEYS,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DATA_ENTRY_HELPER_KEYS, { each: true })
  helperKeys?: DataEntryHelperKey[];
}
