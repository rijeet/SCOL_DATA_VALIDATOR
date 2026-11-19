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

export class RemapDashboardIntakesRequestDto {
  @ApiProperty({ description: 'sys_Universities id' })
  @IsUUID()
  uniId!: string;

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

export class SetDashboardIntakeDeadlineRequestDto {
  @ApiProperty({ description: 'sys_Universities id' })
  @IsUUID()
  uniId!: string;

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

  @ApiPropertyOptional({ description: 'MM/DD/YYYY, or empty to clear' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  applicationDeadline?: string;

  @ApiPropertyOptional({ description: 'Plain number, or empty to clear' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  applicationFee?: string;
}

export class RemapDashboardEnglishScoresRequestDto {
  @ApiProperty()
  @IsUUID()
  uniId!: string;

  @ApiProperty()
  @IsUUID()
  testId!: string;

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

export class RemapDashboardTuitionRequestDto {
  @ApiProperty()
  @IsUUID()
  uniId!: string;

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
