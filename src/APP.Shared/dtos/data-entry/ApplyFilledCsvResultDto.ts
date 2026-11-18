import { ApiProperty } from '@nestjs/swagger';

export class ApplyFilledCsvSkipDto {
  @ApiProperty()
  courseKey!: string;

  @ApiProperty()
  reason!: string;
}

export class ApplyFilledCsvResultDto {
  @ApiProperty()
  updated!: number;

  @ApiProperty()
  catalogUpdated!: number;

  @ApiProperty({ type: [ApplyFilledCsvSkipDto] })
  skipped!: ApplyFilledCsvSkipDto[];
}
