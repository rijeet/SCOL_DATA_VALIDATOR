import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import {
  UNIVERSITY_IMAGE_KINDS,
  type UniversityImageKind,
} from '@shared/constants/dataEntryCloud.constants';

export class ConfirmUniversityImageUploadRequestDto {
  @ApiProperty({ enum: UNIVERSITY_IMAGE_KINDS })
  @IsIn(UNIVERSITY_IMAGE_KINDS)
  kind!: UniversityImageKind;

  @ApiProperty({ example: 'Anglia Ruskin University - ARU' })
  @IsString()
  @MaxLength(255)
  uniName!: string;

  @ApiProperty({ example: 'universities/anglia-ruskin-university-aru/logo' })
  @IsString()
  @MaxLength(500)
  storageKey!: string;
}
