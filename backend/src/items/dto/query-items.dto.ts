import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ITEM_SORTS = ['sku', 'name', 'totalQty', 'reorderAt'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export class QueryItemsDto {
  @ApiPropertyOptional({ description: 'Free-text match on SKU or name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: ITEM_SORTS })
  @IsOptional()
  @IsIn(ITEM_SORTS as unknown as string[])
  sort?: ItemSort;
}
