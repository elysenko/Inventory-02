import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'SKU is required.' })
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'SKU may contain only letters, numbers, dots, dashes and underscores.' })
  sku!: string;

  @ApiProperty({ example: 'M6 Hex Bolt' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Name is required.' })
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Zinc-plated, 30mm' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'ea' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional({ example: 10, description: 'Reorder point — the item is low when totalQty <= reorderAt.' })
  @IsOptional()
  @IsInt({ message: 'Reorder point must be a whole number.' })
  @Min(0, { message: 'Reorder point cannot be negative.' })
  reorderAt?: number;
}
