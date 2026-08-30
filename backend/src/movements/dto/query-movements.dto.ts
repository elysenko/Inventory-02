import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MovementType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const MOVEMENTS_PAGE_SIZE = 50;

export class QueryMovementsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  itemId?: string;

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ description: 'Inclusive lower bound (ISO date or datetime)' })
  @IsOptional()
  @IsDateString({}, { message: '"from" must be a valid date.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive upper bound (ISO date or datetime)' })
  @IsOptional()
  @IsDateString({}, { message: '"to" must be a valid date.' })
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: MOVEMENTS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
