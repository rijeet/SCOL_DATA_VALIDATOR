import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RenameDashboardProgrammeRequestDto {
  @ApiProperty({ description: 'sys_Programmes id' })
  @IsUUID()
  programmeId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  newName!: string;
}
