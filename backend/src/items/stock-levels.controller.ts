import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

export interface ItemStockLevelView {
  id: string;
  itemId: string;
  locationId: string;
  locationName: string;
  zone: string;
  qty: number;
}

/**
 * Flat (item, location, qty) list. The movement form reads this to show what is
 * actually on hand at the chosen source before a clerk submits an OUT or
 * TRANSFER, so the common "insufficient stock" mistake is caught in the UI.
 */
@ApiTags('stock-levels')
@ApiBearerAuth()
@Controller('stock-levels')
export class StockLevelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
  ): Promise<ItemStockLevelView[]> {
    const levels = await this.prisma.stockLevel.findMany({
      where: {
        ...(itemId ? { itemId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      include: { location: { select: { name: true, zone: true } } },
      orderBy: [{ location: { name: 'asc' } }],
    });

    return levels.map((level) => ({
      id: level.id,
      itemId: level.itemId,
      locationId: level.locationId,
      locationName: level.location.name,
      zone: level.location.zone,
      qty: level.qty,
    }));
  }
}
