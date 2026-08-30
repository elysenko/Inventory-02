import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

export interface LocationView {
  id: string;
  name: string;
  zone: string;
  itemCount: number;
  totalQty: number;
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<LocationView[]> {
    const locations = await this.prisma.location.findMany({
      include: { stockLevels: { select: { qty: true } } },
      orderBy: [{ zone: 'asc' }, { name: 'asc' }],
    });

    return locations.map((location) => ({
      id: location.id,
      name: location.name,
      zone: location.zone,
      // Only positions actually holding stock count as "items here" — a level
      // left at zero by an OUT is history, not occupancy.
      itemCount: location.stockLevels.filter((level) => level.qty > 0).length,
      totalQty: location.stockLevels.reduce((sum, level) => sum + level.qty, 0),
    }));
  }

  async findOne(id: string): Promise<LocationView> {
    const all = await this.findAll();
    const found = all.find((location) => location.id === id);
    if (!found) throw new NotFoundException(`Location ${id} not found`);
    return found;
  }

  async create(dto: CreateLocationDto): Promise<LocationView> {
    try {
      const created = await this.prisma.location.create({
        data: { name: dto.name, zone: dto.zone ?? '' },
      });
      return this.findOne(created.id);
    } catch (error) {
      throw this.mapWriteError(error, dto.name);
    }
  }

  async update(id: string, dto: UpdateLocationDto): Promise<LocationView> {
    await this.assertExists(id);
    try {
      await this.prisma.location.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
        },
      });
      return this.findOne(id);
    } catch (error) {
      throw this.mapWriteError(error, dto.name);
    }
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.assertExists(id);

    const [onHand, movements] = await Promise.all([
      this.prisma.stockLevel.count({ where: { locationId: id, qty: { not: 0 } } }),
      this.prisma.movement.count({
        where: { OR: [{ fromLocId: id }, { toLocId: id }] },
      }),
    ]);
    if (onHand > 0) {
      throw new ConflictException('This location still holds stock. Move it out before deleting.');
    }
    if (movements > 0) {
      throw new ConflictException('This location is referenced by movement history and cannot be deleted.');
    }

    await this.prisma.location.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.location.count({ where: { id } });
    if (exists === 0) throw new NotFoundException(`Location ${id} not found`);
  }

  private mapWriteError(error: unknown, name?: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `A location named "${name ?? ''}" already exists.`,
          field: 'name',
        });
      }
      if (error.code === 'P2025') return new NotFoundException('Location not found');
    }
    return error as Error;
  }
}
