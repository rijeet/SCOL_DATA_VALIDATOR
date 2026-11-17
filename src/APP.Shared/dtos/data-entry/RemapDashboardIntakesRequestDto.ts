import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

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
