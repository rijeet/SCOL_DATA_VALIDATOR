import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DATA_ENTRY_MAX_FILE_BYTES,
  UNIVERSITY_IMAGE_KINDS,
  type UniversityImageKind,
} from '@shared/constants/dataEntryCloud.constants';

export class GenerateUniversityImageUploadUrlRequestDto {
  @ApiProperty({ enum: UNIVERSITY_IMAGE_KINDS })
  @IsIn(UNIVERSITY_IMAGE_KINDS)
  kind!: UniversityImageKind;

  @ApiProperty({ example: 'Anglia Ruskin University - ARU' })
  @IsString()
  @MaxLength(255)
  uniName!: string;

  @ApiProperty({ example: 'logo.png' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: 102400 })
  @IsInt()
  @Min(1)
  @Max(DATA_ENTRY_MAX_FILE_BYTES)
  fileSizeBytes!: number;
}
