import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ToeflScalePairDto {
  @ApiProperty({ enum: ['overall', 'section'] })
  @IsIn(['overall', 'section'])
  kind!: 'overall' | 'section';

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  from!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(16)
  to!: string;
}

export class ApplyToeflScaleRequestDto {
  @ApiProperty({ type: [ToeflScalePairDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToeflScalePairDto)
  pairs!: ToeflScalePairDto[];
}
