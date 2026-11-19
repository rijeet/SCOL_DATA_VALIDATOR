import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RemapUnpublishedTuitionRequestDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  fromCurrency!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  fromAmount!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ description: '1–12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  toCurrency!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  toAmount!: string;
}

export class RemapUnpublishedEnglishScoresRequestDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty({ example: 'IELTS' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  testName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  fromOverall!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  fromSection!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  toOverall!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  toSection!: string;
}

export class RemapUnpublishedIntakesRequestDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  fromYear!: number;

  @ApiProperty({ description: '1–12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  fromMonth!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  toYear!: number;

  @ApiProperty({ description: '1–12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  toMonth!: number;
}

export class RemapUnpublishedEntryDegreesRequestDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fromMinDegreeName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromHighDegreeName?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  toMinDegreeName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  toHighDegreeName?: string | null;
}

export class RenameUnpublishedProgrammeRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fromName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  newName!: string;
}

export class RemapUnpublishedScholarshipsRequestDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  degreeName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  fromAmount?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  fromAmountType?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  toName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  toAmount!: string;

  @ApiProperty({ description: 'AMOUNT or PERCENTAGE' })
  @IsString()
  @MinLength(1)
  toAmountType!: string;
}
