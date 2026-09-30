import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDataEntryBatchRequestDto {
  @ApiProperty({
    description: 'sys_Universities row id',
  })
  @IsUUID()
  @IsNotEmpty()
  sysUniversityId!: string;

  @ApiPropertyOptional({
    description:
      'When true, load *_reviewed.csv from Cloudinary SCOL_DATA/{uniName} into staging (one batch per import).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  fromCloud?: boolean;

  /** @deprecated Use sysUniversityId; Cloudinary folder must match uniName. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  universityKey?: string;
}
