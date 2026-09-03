import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialInventoryDto } from './dto/create-material-inventory.dto';
import { UpdateMaterialInventoryDto } from './dto/update-material-inventory.dto';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { CACHE_NS } from '../common/cache/cache-namespaces';

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
    const date = new Date(body.date);
    return this.prisma.materialInventory.upsert({
      where: { materialId_date: { materialId: body.materialId, date } },
      update: {
        supplierId: body.supplierId,
        batchNumber: body.batchNumber,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        quantity: body.quantity,
        delivery: body.delivery,
        notes: body.notes,
      },
      create: {
        materialId: body.materialId,
        date,
        supplierId: body.supplierId,
        batchNumber: body.batchNumber,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
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
        const date = new Date(item.date);
        return this.prisma.materialInventory.upsert({
          where: { materialId_date: { materialId: item.materialId, date } },
          update: {
            supplierId: item.supplierId,
            batchNumber: item.batchNumber,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            quantity: item.quantity,
            delivery: item.delivery,
            notes: item.notes,
          },
          create: {
            materialId: item.materialId,
            date,
            supplierId: item.supplierId,
            batchNumber: item.batchNumber,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
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
      where: { date: new Date(date) },
      orderBy: { material: { name: 'asc' } },
      include: materialInventoryInclude,
    });
  }

  /**
   * Initialise today's stock cards from the previous day's closing stock.
   * Closing stock = quantity + delivery - used.
   * Only creates records that do not already exist for the target date.
   */
  async initDate(
    date: string,
    userId?: number,
    preloadedMaterials?: Array<{ id: number }>,
  ) {
    const targetDate = new Date(date);

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
      where: { date: { lt: targetDate } },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const prevRecords = lastKnown
      ? await this.prisma.materialInventory.findMany({
          where: { date: lastKnown.date },
        })
      : [];
    const prevMap = new Map(prevRecords.map((r) => [r.materialId, r]));

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
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.materialInventory.findMany({
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { material: { name: 'asc' } }],
        include: materialInventoryInclude,
      }),
      this.prisma.materialInventory.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async search(q: string, page = 1, limit = 200) {
    const skip = (page - 1) * limit;
    const where = {
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
    const record = await this.prisma.materialInventory.findUnique({
      where: { id },
      include: materialInventoryInclude,
    });
    if (!record) {
      throw new NotFoundException('Material inventory record not found');
    }
    return record;
  }

  async update(id: number, body: UpdateMaterialInventoryDto) {
    try {
      return await this.prisma.materialInventory.update({
        where: { id },
        data: {
          materialId: body.materialId,
          supplierId: body.supplierId,
          batchNumber: body.batchNumber,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          quantity: body.quantity,
          delivery: body.delivery,
          used: body.used,
          notes: body.notes,
        },
        include: materialInventoryInclude,
      });
    } catch {
      throw new NotFoundException('Material inventory record not found');
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.materialInventory.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Material inventory record not found');
    }
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
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays > 30) {
      throw new Error('Date range must be between 1 and 31 days');
    }

    const dates: Date[] = [];
    for (let ts = start.getTime(); ts <= end.getTime(); ts += 86_400_000) {
      dates.push(new Date(ts));
    }

    const materials = await this.prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const existing = await this.prisma.materialInventory.findMany({
      where: { date: { gte: start, lte: end } },
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
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = endDate
      ? new Date(`${endDate}T00:00:00.000Z`)
      : new Date(`${startDate}T00:00:00.000Z`);

    const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays > 30) {
      throw new Error('Date range must be between 1 and 31 days');
    }

    let totalCreated = 0;
    const results: { date: string; created: number }[] = [];

    for (let ts = start.getTime(); ts <= end.getTime(); ts += 86_400_000) {
      const dateStr = new Date(ts).toISOString().slice(0, 10);
      const result = await this.initDate(dateStr, userId);
      totalCreated += result.created;
      results.push({ date: dateStr, created: result.created });
    }

    return { totalCreated, datesProcessed: results.length, results };
  }

  private computeCarryOver(
    prev: { quantity: number; delivery: number; used: number } | undefined,
  ): number {
    return prev ? Math.max(0, prev.quantity + prev.delivery - prev.used) : 0;
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
