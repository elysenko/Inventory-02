import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
  shortfall: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * An item is low when its total on-hand quantity across every location has
   * fallen to or below its reorder point (`totalQty <= reorderAt`) — standard
   * reorder-point semantics, where hitting the point is itself the signal.
   */
  async lowStock(sort?: string): Promise<LowStockRow[]> {
    const items = await this.prisma.item.findMany({
      include: { stockLevels: { select: { qty: true } } },
    });

    const rows = items
      .map((item) => {
        const totalQty = item.stockLevels.reduce((sum, level) => sum + level.qty, 0);
        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          reorderAt: item.reorderAt,
          totalQty,
          shortfall: item.reorderAt - totalQty,
        };
      })
      .filter((row) => row.totalQty <= row.reorderAt);

    switch (sort) {
      case 'sku':
        rows.sort((a, b) => a.sku.localeCompare(b.sku));
        break;
      case 'name':
        rows.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'totalQty':
        rows.sort((a, b) => a.totalQty - b.totalQty);
        break;
      default:
        // Deepest shortage first — that is the order a manager acts on.
        rows.sort((a, b) => b.shortfall - a.shortfall || a.sku.localeCompare(b.sku));
        break;
    }
    return rows;
  }
}
