import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { MOVEMENTS_PAGE_SIZE, QueryMovementsDto } from './dto/query-movements.dto';

export interface MovementView {
  id: string;
  type: MovementType;
  itemId: string;
  itemSku: string;
  itemName: string;
  fromLocId: string | null;
  toLocId: string | null;
  fromLocName: string | null;
  toLocName: string | null;
  qty: number;
  note: string;
  userName: string;
  createdAt: string;
}

export interface MovementPage {
  rows: MovementView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const MOVEMENT_INCLUDE = {
  item: { select: { id: true, sku: true, name: true } },
  fromLoc: { select: { id: true, name: true } },
  toLoc: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MovementInclude;

type MovementWithRelations = Prisma.MovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a movement and applies its balance effects atomically.
   *
   * The whole operation runs in one transaction, so the audit row and the stock
   * levels can never disagree: either both land or neither does.
   */
  async create(dto: CreateMovementDto, userId: string): Promise<MovementView> {
    const { from, to } = this.resolveEndpoints(dto);

    try {
      return await this.apply(dto, userId, from, to);
    } catch (error) {
      // Two first-ever movements into the same (item, location) can both find no
      // StockLevel row and both try to INSERT; one loses the unique race. That is
      // a benign collision, not a business failure, so retry once — the second
      // attempt takes the UPDATE branch.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.apply(dto, userId, from, to);
      }
      throw error;
    }
  }

  private async apply(
    dto: CreateMovementDto,
    userId: string,
    from: string | null,
    to: string | null,
  ): Promise<MovementView> {
    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: dto.itemId }, select: { id: true } });
      if (!item) throw new NotFoundException('That item no longer exists.');

      for (const locationId of [from, to].filter((id): id is string => id !== null)) {
        const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true } });
        if (!location) throw new NotFoundException('That location no longer exists.');
      }

      if (from) {
        // Conditional decrement: the `qty: { gte }` predicate is part of the
        // UPDATE's WHERE clause, so Postgres itself refuses to write a negative
        // balance. There is no read-then-write window for a concurrent movement
        // to slip through, and a losing writer simply matches zero rows.
        const debited = await tx.stockLevel.updateMany({
          where: { itemId: dto.itemId, locationId: from, qty: { gte: dto.qty } },
          data: { qty: { decrement: dto.qty } },
        });
        if (debited.count === 0) {
          const level = await tx.stockLevel.findUnique({
            where: { itemId_locationId: { itemId: dto.itemId, locationId: from } },
            select: { qty: true },
          });
          // Throwing rolls the transaction back, so the stored balance is left
          // exactly as it was — no partial debit, no audit row.
          throw new BadRequestException(
            `Insufficient stock: only ${level?.qty ?? 0} on hand at the source location.`,
          );
        }
      }

      if (to) {
        await tx.stockLevel.upsert({
          where: { itemId_locationId: { itemId: dto.itemId, locationId: to } },
          create: { itemId: dto.itemId, locationId: to, qty: dto.qty },
          update: { qty: { increment: dto.qty } },
        });
      }

      return tx.movement.create({
        data: {
          type: dto.type,
          itemId: dto.itemId,
          fromLocId: from,
          toLocId: to,
          qty: dto.qty,
          note: dto.note ?? null,
          userId,
        },
        include: MOVEMENT_INCLUDE,
      });
    });

    return MovementsService.toView(created);
  }

  /**
   * Each movement type implies a different pair of endpoints. Normalising here
   * means a TRANSFER can never be stored with a null leg, and an IN can never
   * silently carry a source that nothing would ever debit.
   */
  private resolveEndpoints(dto: CreateMovementDto): { from: string | null; to: string | null } {
    switch (dto.type) {
      case MovementType.IN:
        if (!dto.toLocId) throw new BadRequestException('A receipt (IN) needs a destination location.');
        return { from: null, to: dto.toLocId };

      case MovementType.OUT:
        if (!dto.fromLocId) throw new BadRequestException('An issue (OUT) needs a source location.');
        return { from: dto.fromLocId, to: null };

      case MovementType.TRANSFER:
        if (!dto.fromLocId || !dto.toLocId) {
          throw new BadRequestException('A transfer needs both a source and a destination location.');
        }
        if (dto.fromLocId === dto.toLocId) {
          throw new BadRequestException('A transfer must move stock between two different locations.');
        }
        return { from: dto.fromLocId, to: dto.toLocId };

      default:
        throw new BadRequestException('Unsupported movement type.');
    }
  }

  async findAll(query: QueryMovementsDto): Promise<MovementPage> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = Math.min(query.pageSize ?? MOVEMENTS_PAGE_SIZE, 200);

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = MovementsService.endOfDay(query.to);

    const where: Prisma.MovementWhereInput = {
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.movement.count({ where }),
      this.prisma.movement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      rows: rows.map(MovementsService.toView),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * A date-only "to" filter means "through the end of that day" — otherwise a
   * filter of 2026-08-30 would exclude everything recorded that afternoon.
   */
  private static endOfDay(value: string): Date {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private static toView(movement: MovementWithRelations): MovementView {
    return {
      id: movement.id,
      type: movement.type,
      itemId: movement.itemId,
      itemSku: movement.item.sku,
      itemName: movement.item.name,
      fromLocId: movement.fromLocId,
      toLocId: movement.toLocId,
      fromLocName: movement.fromLoc?.name ?? null,
      toLocName: movement.toLoc?.name ?? null,
      qty: movement.qty,
      note: movement.note ?? '',
      userName: movement.user.name ?? movement.user.email,
      createdAt: movement.createdAt.toISOString(),
    };
  }
}
