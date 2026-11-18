import { ApiProperty } from '@nestjs/swagger';

export class ConfirmUniversityImageUploadResponseDto {
  @ApiProperty({
    example:
      'https://f005.backblazeb2.com/file/scol-assets/universities/anglia-ruskin-university-aru/logo?v=1',
  })
  fileUrl!: string;
}
