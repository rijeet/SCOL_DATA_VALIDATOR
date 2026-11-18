import { ApiProperty } from '@nestjs/swagger';

export class GenerateUniversityImageUploadUrlHeadersDto {
  @ApiProperty({ example: 'image/jpeg' })
  'Content-Type'!: string;
}

export class GenerateUniversityImageUploadUrlResponseDto {
  @ApiProperty({
    description: 'Presigned PUT URL for the public scol-assets bucket',
  })
  uploadUrl!: string;

  @ApiProperty({ example: 'universities/anglia-ruskin-university-aru/logo' })
  storageKey!: string;

  @ApiProperty({ type: GenerateUniversityImageUploadUrlHeadersDto })
  headers!: GenerateUniversityImageUploadUrlHeadersDto;

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;
}
