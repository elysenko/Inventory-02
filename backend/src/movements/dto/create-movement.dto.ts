import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MovementType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMovementDto {
  @ApiProperty({ enum: MovementType })
  @IsEnum(MovementType, { message: 'Type must be one of IN, OUT or TRANSFER.' })
  type!: MovementType;

  @ApiProperty()
  @IsUUID('4', { message: 'Choose an item.' })
  itemId!: string;

  @ApiPropertyOptional({ description: 'Required for OUT and TRANSFER' })
  @IsOptional()
  @IsUUID('4', { message: 'Choose a valid source location.' })
  fromLocId?: string;

  @ApiPropertyOptional({ description: 'Required for IN and TRANSFER' })
  @IsOptional()
  @IsUUID('4', { message: 'Choose a valid destination location.' })
  toLocId?: string;

  @ApiProperty({ example: 50 })
  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1, { message: 'Quantity must be at least 1.' })
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}
