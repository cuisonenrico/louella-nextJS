import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialInventoryDto } from './dto/create-material-inventory.dto';
import { UpdateMaterialInventoryDto } from './dto/update-material-inventory.dto';
import { UpdateMaterialInventoryItemDto } from './dto/update-material-inventory-bulk.dto';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { CACHE_NS } from '../common/cache/cache-namespaces';
import { clampPageSize } from '../common/constants/inventory.constants';
import { computeMaterialClosing } from '../common/utils/inventory-metrics.util';
import {
  assertDateRange,
  eachDayInclusive,
  toUtcDay,
} from '../common/utils/date-range.util';

const materialInventoryInclude = {
  material: true,
  supplier: true,
  // Without the deletedAt filter a soft-deleted adjustment keeps coming back on
  // the stock card, so deleting one looked like a no-op in the UI.
  adjustments: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class MaterialInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheNamespaceService,
  ) {}

  /** Upsert: one stock-card per material per day. */
  create(body: CreateMaterialInventoryDto, userId?: number) {
    const date = toUtcDay(body.date);
    return this.prisma.materialInventory.upsert({
      where: { materialId_date: { materialId: body.materialId, date } },
      update: {
        supplierId: body.supplierId,
        batchNumber: body.batchNumber,
        expiresAt: body.expiresAt ? toUtcDay(body.expiresAt) : undefined,
        quantity: body.quantity,
        delivery: body.delivery,
        notes: body.notes,
        // The unique key excludes deletedAt, so a deleted card still owns this
        // (material, date) slot and this upsert matches it. Re-entering the day
        // is a restore — without this the write lands on a row no read returns.
        deletedAt: null,
      },
      create: {
        materialId: body.materialId,
        date,
        supplierId: body.supplierId,
        batchNumber: body.batchNumber,
        expiresAt: body.expiresAt ? toUtcDay(body.expiresAt) : undefined,
        quantity: body.quantity ?? 0,
        delivery: body.delivery ?? 0,
        notes: body.notes,
        createdById: userId,
      },
      include: materialInventoryInclude,
    });
  }

  async createBulk(items: CreateMaterialInventoryDto[], userId?: number) {
    return this.prisma.$transaction(
      items.map((item) => {
        const date = toUtcDay(item.date);
        return this.prisma.materialInventory.upsert({
          where: { materialId_date: { materialId: item.materialId, date } },
          update: {
            supplierId: item.supplierId,
            batchNumber: item.batchNumber,
            expiresAt: item.expiresAt ? toUtcDay(item.expiresAt) : undefined,
            quantity: item.quantity,
            delivery: item.delivery,
            notes: item.notes,
            // See create(): re-entering a deleted day restores it.
            deletedAt: null,
          },
          create: {
            materialId: item.materialId,
            date,
            supplierId: item.supplierId,
            batchNumber: item.batchNumber,
            expiresAt: item.expiresAt ? toUtcDay(item.expiresAt) : undefined,
            quantity: item.quantity ?? 0,
            delivery: item.delivery ?? 0,
            notes: item.notes,
            createdById: userId,
          },
        });
      }),
    );
  }

  /** Returns all unique dates that have material inventory records, newest first. */
  listDates(limit = 90): Promise<string[]> {
    return this.cache.wrap(CACHE_NS.MATERIAL_AGG, ['dates', limit], () =>
      this.listDatesUncached(limit),
    );
  }

  private async listDatesUncached(limit: number): Promise<string[]> {
    const rows = await this.prisma.materialInventory.findMany({
      where: { deletedAt: null },
      select: { date: true },
      distinct: ['date'],
      orderBy: { date: 'desc' },
      take: limit,
    });
    return rows.map((r) => r.date.toISOString().slice(0, 10));
  }

  /** Returns all material inventory records for a specific date. */
  findByDate(date: string) {
    return this.prisma.materialInventory.findMany({
      where: {
        date: toUtcDay(date),
        deletedAt: null,
        material: { deletedAt: null },
      },
      orderBy: { material: { name: 'asc' } },
      include: materialInventoryInclude,
    });
  }

  /**
   * Initialise today's stock cards from the previous day's closing stock
   * (see computeMaterialClosing — opening + delivery + adjustments - used).
   * Only creates records that do not already exist for the target date.
   */
  async initDate(
    date: string,
    userId?: number,
    preloadedMaterials?: Array<{ id: number }>,
  ) {
    const targetDate = toUtcDay(date);

    const materials =
      preloadedMaterials ??
      (await this.prisma.material.findMany({
        where: { deletedAt: null },
        select: { id: true },
      }));

    // Find the most recent date that has records before targetDate.
    // Using the last known date (rather than hardcoding -1 day) ensures carry-forward
    // works correctly even when days are skipped (holidays, gaps, etc.).
    const lastKnown = await this.prisma.materialInventory.findFirst({
      where: { date: { lt: targetDate }, deletedAt: null },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const prevRecords = lastKnown
      ? await this.prisma.materialInventory.findMany({
          where: { date: lastKnown.date, deletedAt: null },
          // Closing stock folds adjustments in, so they have to come along.
          include: { adjustments: { where: { deletedAt: null } } },
        })
      : [];
    const prevMap = new Map(prevRecords.map((r) => [r.materialId, r]));

    // Deliberately *not* filtered by deletedAt: the unique key ignores it, so a
    // deleted card still occupies its slot and createMany would skip it anyway.
    // Treating it as free would report phantom creations every run.
    const existing = await this.prisma.materialInventory.findMany({
      where: { date: targetDate },
      select: { materialId: true },
    });
    const existingIds = new Set(existing.map((r) => r.materialId));

    const toCreate = materials.filter((m) => !existingIds.has(m.id));
    if (toCreate.length === 0) return { created: 0 };

    // Single batched INSERT ... ON CONFLICT DO NOTHING — one round trip for
    // all materials instead of one statement per material, and race-safe when
    // a manual run overlaps the cron.
    const result = await this.prisma.materialInventory.createMany({
      data: toCreate.map((mat) => ({
        materialId: mat.id,
        date: targetDate,
        quantity: this.computeCarryOver(prevMap.get(mat.id)),
        delivery: 0,
        used: 0,
        createdById: userId,
      })),
      skipDuplicates: true,
    });

    return { created: result.count };
  }

  async findAll(page = 1, limit = 200) {
    limit = clampPageSize(limit);
    const skip = (page - 1) * limit;
    const where = { deletedAt: null, material: { deletedAt: null } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.materialInventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { material: { name: 'asc' } }],
        include: materialInventoryInclude,
      }),
      this.prisma.materialInventory.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async search(q: string, page = 1, limit = 200) {
    limit = clampPageSize(limit);
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      // A retired material should not come back through its old stock cards.
      material: { deletedAt: null },
      OR: [
        { notes: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { batchNumber: { contains: q, mode: Prisma.QueryMode.insensitive } },
        {
          material: {
            name: { contains: q, mode: Prisma.QueryMode.insensitive },
          },
        },
        {
          supplier: {
            name: { contains: q, mode: Prisma.QueryMode.insensitive },
          },
        },
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.materialInventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { material: { name: 'asc' } },
        include: materialInventoryInclude,
      }),
      this.prisma.materialInventory.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const record = await this.prisma.materialInventory.findFirst({
      where: { id, deletedAt: null },
      include: materialInventoryInclude,
    });
    if (!record) {
      throw new NotFoundException('Material inventory record not found');
    }
    return record;
  }

  /**
   * A blanket `try { ... } catch { throw NotFound }` used to wrap this, so a
   * unique-constraint collision — changing materialId onto a day that already
   * has a card — was reported as "record not found". It also ran ahead of
   * PrismaExceptionFilter, which would have turned that same error into an
   * accurate 409. Check existence explicitly; let everything else through.
   */
  async update(
    id: number,
    body: UpdateMaterialInventoryDto,
    userId?: number,
  ) {
    const existing = await this.prisma.materialInventory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Material inventory record not found');
    }

    return this.prisma.materialInventory.update({
      where: { id },
      data: {
          materialId: body.materialId,
          supplierId: body.supplierId,
          batchNumber: body.batchNumber,
          expiresAt: body.expiresAt ? toUtcDay(body.expiresAt) : undefined,
          quantity: body.quantity,
          delivery: body.delivery,
        used: body.used,
        notes: body.notes,
        updatedById: userId ?? null,
      },
      include: materialInventoryInclude,
    });
  }

  /**
   * Apply a whole sheet's worth of edits in one request.
   *
   * The sheet sent one PATCH per edited row, which runs into the same
   * 20-requests/minute ceiling as the inventory sheet — and `Promise.all`
   * rejects on the first 429, reporting a failure over a partial write.
   *
   * One read to validate, one batched transaction to write. Prisma pipelines an
   * array `$transaction` into a single round trip, which matters against a
   * cross-region database.
   */
  async updateBulk(
    items: UpdateMaterialInventoryItemDto[],
    userId?: number,
  ) {
    if (items.length === 0) return { updated: 0 };

    const ids = items.map((i) => i.id);
    const existing = await this.prisma.materialInventory.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });

    // All-or-nothing: a partial save is the failure mode this replaces.
    if (existing.length !== ids.length) {
      const found = new Set(existing.map((r) => r.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Material stock cards not found: ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.materialInventory.update({
          where: { id: item.id },
          data: {
            quantity: item.quantity,
            delivery: item.delivery,
            used: item.used,
            notes: item.notes,
            updatedById: userId ?? null,
          },
        }),
      ),
    );

    return { updated: items.length };
  }

  /**
   * Soft delete. A hard delete here used to cascade into MaterialAdjustment and
   * destroy the card's spoilage and restock history — the one record of why the
   * numbers moved.
   */
  async remove(id: number) {
    const existing = await this.prisma.materialInventory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Material inventory record not found');
    }
    return this.prisma.materialInventory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Return all material × date combos that have no MaterialInventory entry
   * within the given date range. Limited to 31 days.
   */
  getGaps(startDate: string, endDate: string) {
    return this.cache.wrap(
      CACHE_NS.MATERIAL_AGG,
      ['gaps', startDate, endDate],
      () => this.getGapsUncached(startDate, endDate),
    );
  }

  private async getGapsUncached(startDate: string, endDate: string) {
    const start = toUtcDay(startDate);
    const end = toUtcDay(endDate);
    assertDateRange(start, end);

    const dates = eachDayInclusive(start, end);

    const materials = await this.prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const existing = await this.prisma.materialInventory.findMany({
      where: { date: { gte: start, lte: end }, deletedAt: null },
      select: { materialId: true, date: true },
    });

    const existingKeys = new Set(
      existing.map(
        (r) => `${r.materialId}-${r.date.toISOString().slice(0, 10)}`,
      ),
    );

    const missing = this.findGapEntries(materials, dates, existingKeys);

    return { missing, total: missing.length };
  }

  /**
   * Initialise stock cards for every day in [startDate, endDate] by calling
   * initDate() for each day in order (so carry-over chaining works correctly).
   */
  async initDateRange(startDate: string, endDate?: string, userId?: number) {
    const start = toUtcDay(startDate);
    const end = endDate ? toUtcDay(endDate) : start;

    assertDateRange(start, end);

    let totalCreated = 0;
    const results: { date: string; created: number }[] = [];

    for (const day of eachDayInclusive(start, end)) {
      const dateStr = day.toISOString().slice(0, 10);
      const result = await this.initDate(dateStr, userId);
      totalCreated += result.created;
      results.push({ date: dateStr, created: result.created });
    }

    return { totalCreated, datesProcessed: results.length, results };
  }

  /**
   * Yesterday's closing stock becomes today's opening stock.
   *
   * This used to be `quantity + delivery - used`, which silently dropped every
   * MaterialAdjustment: a 20 kg spoilage was recorded on the card and then
   * carried forward as if the flour were still there, and the error compounded
   * every day after. The shared helper folds the adjustments in with the same
   * signs the sold formula uses.
   */
  private computeCarryOver(
    prev:
      | {
          quantity: number;
          delivery: number;
          used: number;
          adjustments?: { type: string; value: number }[];
        }
      | undefined,
  ): number {
    return prev ? computeMaterialClosing(prev) : 0;
  }

  private findGapEntries(
    materials: { id: number; name: string }[],
    dates: Date[],
    existingKeys: Set<string>,
  ): { materialId: number; materialName: string; date: string }[] {
    const missing: {
      materialId: number;
      materialName: string;
      date: string;
    }[] = [];
    for (const material of materials) {
      for (const date of dates) {
        const key = `${material.id}-${date.toISOString().slice(0, 10)}`;
        if (!existingKeys.has(key)) {
          missing.push({
            materialId: material.id,
            materialName: material.name,
            date: date.toISOString().slice(0, 10),
          });
        }
      }
    }
    return missing;
  }
}
