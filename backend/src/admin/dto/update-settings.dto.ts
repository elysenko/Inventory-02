import { IsArray, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SettingEntryDto {
  @ApiProperty({ example: 'MINIO_BUCKET' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  key!: string;

  @ApiProperty({ example: 'stockroom-media' })
  @IsString()
  @MaxLength(4000)
  value!: string;
}

export class UpdateSettingsDto {
  @ApiProperty({ type: [SettingEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingEntryDto)
  settings!: SettingEntryDto[];
}
