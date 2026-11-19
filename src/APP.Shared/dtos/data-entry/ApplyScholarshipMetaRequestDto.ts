import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ScholarshipMetaFillDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  amount!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  metadata!: string;
}

export class ApplyScholarshipMetaRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  clearMetadata!: string[];

  @ApiProperty({ type: [ScholarshipMetaFillDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScholarshipMetaFillDto)
  fills!: ScholarshipMetaFillDto[];
}
