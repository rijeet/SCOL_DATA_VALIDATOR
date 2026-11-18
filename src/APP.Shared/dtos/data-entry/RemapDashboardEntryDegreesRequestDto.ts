import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class RemapDashboardEntryDegreesRequestDto {
  @ApiProperty({ description: 'sys_Universities id' })
  @IsUUID()
  uniId!: string;

  @ApiProperty()
  @IsUUID()
  fromMinDegreeId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  fromHighDegreeId?: string | null;

  @ApiProperty()
  @IsUUID()
  toMinDegreeId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  toHighDegreeId?: string | null;
}
