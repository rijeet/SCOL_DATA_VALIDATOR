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
  UNIVERSITY_IMAGE_KINDS,
  UNIVERSITY_IMAGE_MAX_BYTES,
  UNIVERSITY_IMAGE_MIME_TYPES,
  type UniversityImageKind,
  type UniversityImageMimeType,
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

  @ApiProperty({ enum: UNIVERSITY_IMAGE_MIME_TYPES })
  @IsIn(UNIVERSITY_IMAGE_MIME_TYPES)
  mimeType!: UniversityImageMimeType;

  @ApiProperty({ example: 102400, description: 'Maximum 5 MB.' })
  @IsInt()
  @Min(1)
  @Max(UNIVERSITY_IMAGE_MAX_BYTES)
  fileSizeBytes!: number;
}
