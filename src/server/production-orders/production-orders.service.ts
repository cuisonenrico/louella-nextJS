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
import { recordChanges } from '../common/utils/audit.util';
import { lockInventoryChains } from '../common/utils/stock-chain';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';

/**
 * Finalization writes one kitchen yield, one material card per ingredient and
 * one delivery (plus carry-forward) per item, sequentially inside a single
 * interactive transaction. Prisma's 5 s default is too tight for a full order.
 */
const FINALIZE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

type OrderLike = {
  branchId: number | null;
  date: Date;
  status: string;
  notes: string | null;
  deletedAt: Date | null;
  items?: Array<{ productId: number; yield: number }>;
};

/** What the change history records for an order: its fields plus its lines as one string. */
export function orderAuditRow(order: OrderLike) {
  const items = [...(order.items ?? [])]
    .sort((a, b) => a.productId - b.productId)
    .map((i) => `${i.productId}×${i.yield}`)
    .join(', ');
  return {
    branchId: order.branchId,
    date: order.date,
    status: order.status,
    notes: order.notes,
    deletedAt: order.deletedAt,
    items,
  };
}

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
    await this.assertNoEquipment(dto.items);
    await this.ensureInventoryForDate(dto.branchId, dto.date);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({
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
      await recordChanges(
        tx,
        [{ entity: 'ProductionOrder', entityId: order.id, before: null, after: orderAuditRow(order) }],
        userId,
      );
      return order;
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
    if (dto.items) await this.assertNoEquipment(dto.items);

    // Order edit and finalization commit together, so an order can never be
    // FINALIZED without its yield, deliveries and material use booked.
    return this.prisma.$transaction(async (tx) => {
      // Claim the draft before writing anything. The status checks above ran
      // outside this transaction, so a finalize, an edit and a cancel can all
      // pass them at once. This conditional update row-locks the order and
      // matches only while it is still a DRAFT, so exactly one of them wins:
      // no second finalize books stock twice, and no edit rewrites the items
      // of an order whose stock was just booked.
      const claimed = await tx.productionOrder.updateMany({
        where: { id, status: ProductionOrderStatus.DRAFT, deletedAt: null },
        data: {
          status: isBeingFinalized ? ProductionOrderStatus.FINALIZED : ProductionOrderStatus.DRAFT,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'This production order was already finalized or cancelled.',
        );
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

      await recordChanges(
        tx,
        [{ entity: 'ProductionOrder', entityId: id, before: orderAuditRow(existing), after: orderAuditRow(order) }],
        userId,
      );

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
          userId,
        );
      }
    }
  }

  async remove(id: number, branchScope?: number, userId?: number) {
    const existing = await this.findOne(id, branchScope);
    if (existing.status === ProductionOrderStatus.FINALIZED) {
      throw new BadRequestException(
        'Cannot delete a finalized production order',
      );
    }
    // Cancel only while it is still a DRAFT, in one statement: a finalize that
    // committed after the check above must not be cancelled with its stock booked.
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.productionOrder.updateMany({
        where: { id, status: ProductionOrderStatus.DRAFT, deletedAt: null },
        data: { status: ProductionOrderStatus.CANCELLED, deletedAt: new Date() },
      });
      if (cancelled.count !== 1) {
        throw new ConflictException(
          'This production order was already finalized or cancelled.',
        );
      }
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id },
        include: this.defaultInclude,
      });
      await recordChanges(
        tx,
        [{ entity: 'ProductionOrder', entityId: id, before: orderAuditRow(existing), after: orderAuditRow(order), action: 'delete' }],
        userId,
      );
      return order;
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
  /** Equipment (trays, freezer…) is counted at the branch, never ordered from the kitchen. */
  private async assertNoEquipment(items: Array<{ productId: number; yield?: number }>) {
    const ids = items.filter((i) => (i.yield ?? 0) > 0).map((i) => i.productId);
    if (ids.length === 0) return;
    const equipment = await this.prisma.product.findMany({
      where: { id: { in: ids }, isEquipment: true },
      select: { name: true },
    });
    if (equipment.length > 0) {
      throw new BadRequestException(
        `${equipment.map((p) => p.name).join(', ')} ${equipment.length === 1 ? 'is' : 'are'} equipment and cannot be ordered.`,
      );
    }
  }

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

    // Read the previous close under the chains' lock, so a leftover saved at
    // the same moment is either seen here or walks forward onto these rows.
    await this.prisma.$transaction(async (tx) => {
      await lockInventoryChains(tx, missing.map((p) => ({ branchId, productId: p.id })));
      // Newest live prior row per product, resolved in the database. This used
      // to fetch every prior row for every missing product, deleted ones
      // included, so a soft-deleted day could seed the opening balance.
      const priorEntries = await tx.$queryRaw<
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

      await tx.inventory.createMany({
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
    });
  }
}
