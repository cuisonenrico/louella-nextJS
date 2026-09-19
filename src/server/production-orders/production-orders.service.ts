import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionService } from '../production/production.service';
import { InventoryService } from '../inventory/inventory.service';
import { toUtcDay } from '../common/utils/date-range.util';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';

/**
 * Finalization writes one kitchen yield, one material card per ingredient and
 * one delivery (plus carry-forward) per item, sequentially inside a single
 * interactive transaction. Prisma's 5 s default is too tight for a full order.
 */
const FINALIZE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly production: ProductionService,
    private readonly inventory: InventoryService,
  ) {}

  private readonly defaultInclude = {
    items: {
      include: { product: true },
      orderBy: [
        { product: { type: 'asc' as const } },
        { product: { sortOrder: 'asc' as const } },
        { product: { name: 'asc' as const } },
      ],
    },
    createdBy: { select: { id: true, email: true, role: true } },
    branch: { select: { id: true, name: true } },
  };

  private async ensureActiveBranch(branchId: number): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }
  }

  async create(dto: CreateProductionOrderDto, userId?: number) {
    await this.ensureActiveBranch(dto.branchId);
    await this.ensureInventoryForDate(dto.branchId, dto.date);

    return this.prisma.productionOrder.create({
      data: {
        branchId: dto.branchId,
        date: toUtcDay(dto.date),
        notes: dto.notes,
        createdById: userId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            yield: item.yield ?? 0,
          })),
        },
      },
      include: this.defaultInclude,
    });
  }

  async findAll(page = 1, limit = 20, branchId?: number) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(branchId ? { branchId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: 'desc' },
        include: this.defaultInclude,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByDate(date: string, branchId?: number) {
    return this.prisma.productionOrder.findMany({
      where: {
        date: toUtcDay(date),
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude,
    });
  }

  async findOne(id: number, branchScope?: number) {
    const record = await this.prisma.productionOrder.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(branchScope != null ? { branchId: branchScope } : {}),
      },
      include: this.defaultInclude,
    });
    if (!record) throw new NotFoundException('Production order not found');
    return record;
  }

  async update(
    id: number,
    dto: UpdateProductionOrderDto,
    branchScope?: number,
    userId?: number,
  ) {
    const existing = await this.findOne(id, branchScope);

    if (existing.status === ProductionOrderStatus.FINALIZED) {
      throw new BadRequestException('Cannot edit a finalized production order');
    }
    if (existing.status === ProductionOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a cancelled production order');
    }

    const isBeingFinalized = dto.status === ProductionOrderStatus.FINALIZED;

    if (dto.branchId && dto.branchId !== existing.branchId) {
      await this.ensureActiveBranch(dto.branchId);
    }

    // Order edit and finalization commit together, so an order can never be
    // FINALIZED without its yield, deliveries and material use booked.
    return this.prisma.$transaction(async (tx) => {
      if (isBeingFinalized) {
        // Claim the transition before booking anything. Finalizing *adds*
        // stock, so a second finalize (a double-click, a retry) must not get
        // through the status check above, which ran outside this transaction.
        // Only one request can move the row off DRAFT.
        const claimed = await tx.productionOrder.updateMany({
          where: { id, status: ProductionOrderStatus.DRAFT, deletedAt: null },
          data: { status: ProductionOrderStatus.FINALIZED },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'This production order was already finalized or cancelled.',
          );
        }
      }

      const order = await tx.productionOrder.update({
        where: { id },
        data: {
          branchId: dto.branchId,
          status: dto.status,
          notes: dto.notes,
          ...(dto.items
            ? {
                items: {
                  deleteMany: {},
                  create: dto.items.map((item) => ({
                    productId: item.productId,
                    yield: item.yield ?? 0,
                  })),
                },
              }
            : {}),
        },
        include: this.defaultInclude,
      });

      if (isBeingFinalized) {
        // The order as just saved: its items and, if this same request moved
        // it, its new branch rather than the one it had before.
        await this.applyFinalization(tx, order, userId);
      }

      return order;
    }, FINALIZE_TX_OPTIONS);
  }

  /**
   * Book a finalized order: the kitchen made it, the branch received it.
   *
   * Both are *added* to what is already recorded for the day, so several
   * orders for the same product and date sum (decision 2026-09-19). Material
   * consumption follows the kitchen yield, exactly as a production-sheet save
   * does.
   */
  private async applyFinalization(
    tx: Prisma.TransactionClient,
    order: {
      date: Date;
      branchId: number | null;
      items: Array<{ productId: number; yield: number }>;
    },
    userId?: number,
  ): Promise<void> {
    const items = order.items
      .filter((item) => item.yield > 0)
      .map((item) => ({ productId: item.productId, quantity: item.yield }));
    if (items.length === 0) return;

    await this.production.addOrderYield(tx, order.date, items, userId);

    if (order.branchId) {
      for (const item of items) {
        await this.inventory.addDeliveryInTx(
          tx,
          { branchId: order.branchId, productId: item.productId, date: order.date },
          item.quantity,
        );
      }
    }
  }

  async remove(id: number, branchScope?: number) {
    const existing = await this.findOne(id, branchScope);
    if (existing.status === ProductionOrderStatus.FINALIZED) {
      throw new BadRequestException(
        'Cannot delete a finalized production order',
      );
    }
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: ProductionOrderStatus.CANCELLED, deletedAt: new Date() },
      include: this.defaultInclude,
    });
  }

  /** Returns aggregated planned yield per product for a given date (sum of all POs). */
  async getPlannedYieldByDate(date: string, branchId?: number) {
    const orders = await this.prisma.productionOrder.findMany({
      where: {
        date: toUtcDay(date),
        status: { not: ProductionOrderStatus.CANCELLED },
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      include: { items: true },
    });

    const yieldByProduct = new Map<number, number>();
    for (const order of orders) {
      for (const item of order.items) {
        yieldByProduct.set(
          item.productId,
          (yieldByProduct.get(item.productId) ?? 0) + item.yield,
        );
      }
    }

    return Array.from(yieldByProduct.entries()).map(
      ([productId, plannedYield]) => ({
        productId,
        plannedYield,
      }),
    );
  }

  /**
   * Ensures every active product has an Inventory placeholder for the given
   * branch + date. Runs inside create() so staff can always open a PO without
   * needing to wait for the nightly cron. Missing rows carry forward the most
   * recent prior leftover (or 0 if none exists).
   */
  private async ensureInventoryForDate(
    branchId: number,
    dateStr: string,
  ): Promise<void> {
    const date = toUtcDay(dateStr);

    const [products, existing] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      }),
      // Not filtered by deletedAt: a deleted row still owns its slot.
      this.prisma.inventory.findMany({
        where: { branchId, date },
        select: { productId: true },
      }),
    ]);

    const existingSet = new Set(existing.map((r) => r.productId));
    const missing = products.filter((p) => !existingSet.has(p.id));
    if (missing.length === 0) return;

    // Newest live prior row per product, resolved in the database. This used
    // to fetch every prior row for every missing product, deleted ones
    // included, so a soft-deleted day could seed the opening balance.
    const priorEntries = await this.prisma.$queryRaw<
      Array<{ productId: number; leftover: number }>
    >`
      SELECT DISTINCT ON ("productId") "productId", "leftover"
      FROM "Inventory"
      WHERE "branchId" = ${branchId}
        AND "productId" IN (${Prisma.join(missing.map((p) => p.id))})
        AND "date" < ${date}
        AND "deletedAt" IS NULL
      ORDER BY "productId", "date" DESC
    `;
    const priorMap = new Map(priorEntries.map((e) => [e.productId, e.leftover]));

    await this.prisma.inventory.createMany({
      data: missing.map((p) => {
        const prevLeftover = priorMap.get(p.id) ?? 0;
        return {
          branchId,
          productId: p.id,
          date,
          quantity: prevLeftover,
          delivery: 0,
          leftover: prevLeftover,
          reject: 0,
          isAutoGenerated: true,
          notes: `Auto-initialized for production order on ${dateStr}`,
        };
      }),
      skipDuplicates: true,
    });
  }
}
