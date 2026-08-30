import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';

export interface ItemView {
  id: string;
  sku: string;
  name: string;
  description: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
}

export interface ItemStockLevelView {
  id: string;
  locationId: string;
  locationName: string;
  zone: string;
  qty: number;
}

export interface ItemDetailView extends ItemView {
  stockLevels: ItemStockLevelView[];
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryItemsDto): Promise<ItemView[]> {
    const q = query.q?.trim();
    const where: Prisma.ItemWhereInput = q
      ? {
          OR: [
            { sku: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {};

    const items = await this.prisma.item.findMany({
      where,
      include: { stockLevels: { select: { qty: true } } },
      orderBy: { sku: 'asc' },
    });

    const rows: ItemView[] = items.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      unit: item.unit,
      reorderAt: item.reorderAt,
      totalQty: item.stockLevels.reduce((sum, level) => sum + level.qty, 0),
    }));

    // totalQty is a computed aggregate, so it cannot be ordered in SQL without
    // dropping to a raw query — sort the (small) catalog in memory instead.
    switch (query.sort) {
      case 'name':
        rows.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'totalQty':
        rows.sort((a, b) => a.totalQty - b.totalQty);
        break;
      case 'reorderAt':
        rows.sort((a, b) => b.reorderAt - a.reorderAt);
        break;
      default:
        break;
    }
    return rows;
  }

  async findOne(id: string): Promise<ItemDetailView> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        stockLevels: {
          include: { location: { select: { id: true, name: true, zone: true } } },
          orderBy: { location: { name: 'asc' } },
        },
      },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);

    const stockLevels: ItemStockLevelView[] = item.stockLevels.map((level) => ({
      id: level.id,
      locationId: level.locationId,
      locationName: level.location.name,
      zone: level.location.zone,
      qty: level.qty,
    }));

    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      unit: item.unit,
      reorderAt: item.reorderAt,
      // The per-location breakdown is derived from the same rows as the total,
      // so the detail table always sums to the headline number.
      totalQty: stockLevels.reduce((sum, level) => sum + level.qty, 0),
      stockLevels,
    };
  }

  async create(dto: CreateItemDto): Promise<ItemDetailView> {
    try {
      const created = await this.prisma.item.create({
        data: {
          sku: dto.sku,
          name: dto.name,
          description: dto.description ?? '',
          unit: dto.unit?.length ? dto.unit : 'ea',
          reorderAt: dto.reorderAt ?? 0,
        },
      });
      return this.findOne(created.id);
    } catch (error) {
      throw this.mapWriteError(error, dto.sku);
    }
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemDetailView> {
    await this.assertExists(id);
    try {
      await this.prisma.item.update({
        where: { id },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.reorderAt !== undefined ? { reorderAt: dto.reorderAt } : {}),
        },
      });
      return this.findOne(id);
    } catch (error) {
      throw this.mapWriteError(error, dto.sku);
    }
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.assertExists(id);

    // Deleting an item with history would orphan the audit log, so the delete is
    // refused while any stock is on hand or any movement references the item.
    const [onHand, movements] = await Promise.all([
      this.prisma.stockLevel.count({ where: { itemId: id, qty: { not: 0 } } }),
      this.prisma.movement.count({ where: { itemId: id } }),
    ]);
    if (onHand > 0) {
      throw new ConflictException('This item still has stock on hand. Move it out before deleting.');
    }
    if (movements > 0) {
      throw new ConflictException('This item has movement history and cannot be deleted.');
    }

    await this.prisma.item.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.item.count({ where: { id } });
    if (exists === 0) throw new NotFoundException(`Item ${id} not found`);
  }

  /**
   * A duplicate SKU is a validation failure, not a server error: Postgres
   * rejects the INSERT so no second row is ever written, and the client gets a
   * 409 naming the offending field.
   */
  private mapWriteError(error: unknown, sku?: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `SKU ${sku ?? ''} is already in use.`.replace('  ', ' '),
          field: 'sku',
        });
      }
      if (error.code === 'P2025') {
        return new NotFoundException('Item not found');
      }
    }
    if (error instanceof BadRequestException || error instanceof ConflictException) return error;
    return error as Error;
  }
}
