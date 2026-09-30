import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateDataEntryRowRequestDto {
  @ApiProperty({
    description: 'Partial or full course row fields (CSV column names)',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  fields!: Record<string, string>;
}
