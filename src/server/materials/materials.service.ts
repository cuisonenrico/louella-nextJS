import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { computeAdjSum } from '../common/utils/inventory-metrics.util';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  create(body: CreateMaterialDto) {
    return this.prisma.material.create({
      data: {
        name: body.name,
        unit: body.unit,
        pricePerUnit: body.pricePerUnit,
        reorderLevel: body.reorderLevel,
      },
    });
  }

  async createBulk(items: CreateMaterialDto[]) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.material.create({
          data: {
            name: item.name,
            unit: item.unit,
            pricePerUnit: item.pricePerUnit,
            reorderLevel: item.reorderLevel,
          },
        }),
      ),
    );
  }

  findAll() {
    return this.prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  search(q: string) {
    return this.prisma.material.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: { contains: q, mode: 'insensitive' } }],
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const material = await this.prisma.material.findFirst({
      where: { id, deletedAt: null },
      include: {
        recipeItems: {
          include: { recipe: { include: { product: true } } },
        },
        priceHistory: { orderBy: { effectiveAt: 'desc' } },
      },
    });
    if (!material) {
      throw new NotFoundException('Material not found');
    }
    return material;
  }

  async update(id: number, body: UpdateMaterialDto) {
    const existing = await this.findOne(id);

    const needsPriceRecord =
      body.pricePerUnit !== undefined &&
      body.pricePerUnit !== existing.pricePerUnit.toNumber();

    if (needsPriceRecord) {
      const [updated] = await this.prisma.$transaction([
        this.prisma.material.update({
          where: { id },
          data: {
            name: body.name,
            unit: body.unit,
            pricePerUnit: body.pricePerUnit,
            reorderLevel: body.reorderLevel,
          },
        }),
        this.prisma.materialPriceHistory.create({
          data: {
            materialId: id,
            pricePerUnit: body.pricePerUnit!,
            effectiveAt: body.priceEffectiveAt
              ? new Date(body.priceEffectiveAt)
              : new Date(),
          },
        }),
      ]);
      return updated;
    }

    return this.prisma.material.update({
      where: { id },
      data: {
        name: body.name,
        unit: body.unit,
        pricePerUnit: body.pricePerUnit,
        reorderLevel: body.reorderLevel,
      },
    });
  }

  async getPriceHistory(id: number) {
    await this.findOne(id);
    return this.prisma.materialPriceHistory.findMany({
      where: { materialId: id },
      orderBy: { effectiveAt: 'desc' },
      include: { supplier: true },
    });
  }

  async findLowStock() {
    const materials = await this.prisma.material.findMany({
      where: { deletedAt: null, reorderLevel: { gt: 0 } },
      orderBy: { name: 'asc' },
    });

    if (materials.length === 0) return [];

    // Batch-fetch the most recent inventory record per material in one query,
    // including adjustments so the stock formula matches the dashboard.
    const latestInventories = await this.prisma.materialInventory.findMany({
      where: { materialId: { in: materials.map((m) => m.id) } },
      select: {
        materialId: true,
        quantity: true,
        delivery: true,
        used: true,
        date: true,
        adjustments: {
          where: { deletedAt: null },
          select: { type: true, value: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const latestByMaterial = new Map<
      number,
      { quantity: number; delivery: number; used: number; adjDelta: number }
    >();
    for (const inv of latestInventories) {
      if (!latestByMaterial.has(inv.materialId)) {
        const adjDelta = computeAdjSum(inv.adjustments);
        latestByMaterial.set(inv.materialId, {
          quantity: inv.quantity,
          delivery: inv.delivery,
          used: inv.used,
          adjDelta,
        });
      }
    }

    const result: ((typeof materials)[0] & { currentStock: number })[] = [];
    for (const material of materials) {
      const inv = latestByMaterial.get(material.id);
      const currentStock = inv
        ? Math.max(0, inv.quantity + inv.delivery - inv.used + inv.adjDelta)
        : 0;
      if (currentStock < material.reorderLevel.toNumber()) {
        result.push({ ...material, currentStock });
      }
    }

    return result;
  }

  async remove(id: number) {
    const material = await this.prisma.material.findFirst({
      where: { id, deletedAt: null },
    });
    if (!material) {
      throw new NotFoundException('Material not found');
    }
    // Soft delete
    return this.prisma.material.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
