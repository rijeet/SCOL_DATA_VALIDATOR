import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DataEntryStagingSummaryDto {
  @ApiProperty()
  batchId!: string;

  @ApiProperty()
  rowCount!: number;

  @ApiProperty()
  invalidRowCount!: number;

  @ApiProperty()
  validRowCount!: number;

  @ApiProperty({ example: 'VALIDATED' })
  status!: string;

  @ApiPropertyOptional()
  publishedAt?: string | null;
}

export class DataEntryUniversityListItemDto {
  @ApiProperty()
  sysUniversityId!: string;

  @ApiProperty({ example: 'Anglia Ruskin University - ARU' })
  uniName!: string;

  @ApiPropertyOptional({ type: DataEntryStagingSummaryDto })
  staging?: DataEntryStagingSummaryDto | null;
}
