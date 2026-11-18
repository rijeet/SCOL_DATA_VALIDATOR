import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class GenerateApplyFilledUploadUrlRequestDto {
  @ApiProperty({ example: 'cardiff_metropolitan_university_courses_filled.csv' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: 102400 })
  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  fileSizeBytes!: number;
}
