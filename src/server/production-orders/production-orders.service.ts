import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Branch where production yield records are attributed (central kitchen).
// Set PRODUCTION_BRANCH_ID in env if branch 1 is not the production kitchen.
const PRODUCTION_BRANCH_ID = parseInt(
  process.env.PRODUCTION_BRANCH_ID ?? '1',
  10,
);
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';

@Injectable()
export class ProductionOrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
        date: new Date(dto.date),
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
        date: new Date(date),
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

    // Determine the effective items after this update (for production yield upsert)
    const effectiveItems = dto.items
      ? dto.items.map((item) => ({
          productId: item.productId,
          yield: item.yield ?? 0,
        }))
      : existing.items.map((item) => ({
          productId: item.productId,
          yield: item.yield,
        }));

    // Order status update + finalization upserts in a single transaction so a
    // crash cannot leave an order marked FINALIZED without inventory being updated.
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
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

      if (isBeingFinalized && effectiveItems.length > 0) {
        await this.applyFinalization(
          tx,
          existing.date,
          existing.branchId,
          effectiveItems,
        );
      }

      return order;
    });

    return updatedOrder;
  }

  private async applyFinalization(
    tx: Prisma.TransactionClient,
    orderDate: Date,
    deliveryBranchId: number | null,
    effectiveItems: Array<{ productId: number; yield: number }>,
  ): Promise<void> {
    const yieldedItems = effectiveItems.filter((item) => item.yield > 0);

    for (const item of yieldedItems) {
      await tx.production.upsert({
        where: {
          branchId_productId_date: {
            branchId: PRODUCTION_BRANCH_ID,
            productId: item.productId,
            date: orderDate,
          },
        },
        update: { yield: item.yield },
        create: {
          branchId: PRODUCTION_BRANCH_ID,
          productId: item.productId,
          date: orderDate,
          yield: item.yield,
          isAutoGenerated: false,
        },
      });

      if (deliveryBranchId) {
        await tx.inventory.upsert({
          where: {
            branchId_productId_date: {
              branchId: deliveryBranchId,
              productId: item.productId,
              date: orderDate,
            },
          },
          update: { delivery: item.yield },
          create: {
            branchId: deliveryBranchId,
            productId: item.productId,
            date: orderDate,
            quantity: 0,
            delivery: item.yield,
            leftover: 0,
            reject: 0,
            isAutoGenerated: false,
          },
        });
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
        date: new Date(date),
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
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    const [products, existing] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      }),
      this.prisma.inventory.findMany({
        where: { branchId, date },
        select: { productId: true },
      }),
    ]);

    const existingSet = new Set(existing.map((r) => r.productId));
    const missing = products.filter((p) => !existingSet.has(p.id));
    if (missing.length === 0) return;

    const missingIds = missing.map((p) => p.id);
    const priorEntries = await this.prisma.inventory.findMany({
      where: { branchId, productId: { in: missingIds }, date: { lt: date } },
      orderBy: { date: 'desc' },
      select: { productId: true, leftover: true },
    });
    const priorMap = new Map<number, number>();
    for (const e of priorEntries) {
      if (!priorMap.has(e.productId)) priorMap.set(e.productId, e.leftover);
    }

    await this.prisma.$transaction(
      missing.map((p) => {
        const prevLeftover = priorMap.get(p.id) ?? 0;
        return this.prisma.inventory.upsert({
          where: {
            branchId_productId_date: { branchId, productId: p.id, date },
          },
          update: {},
          create: {
            branchId,
            productId: p.id,
            date,
            quantity: prevLeftover,
            delivery: 0,
            leftover: prevLeftover,
            reject: 0,
            isAutoGenerated: true,
            notes: `Auto-initialized for production order on ${dateStr}`,
          },
        });
      }),
    );
  }
}
