import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RemapDashboardScholarshipsRequestDto {
  @ApiProperty({ description: 'sys_Universities id' })
  @IsUUID()
  uniId!: string;

  @ApiProperty({ description: 'Awarded sys_AcademicDegrees id' })
  @IsUUID()
  degreeId!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null/empty = courses with no scholarship',
  })
  @IsOptional()
  @IsString()
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