import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MeasurementUnit, Prisma } from '@prisma/client';
import { toUtcDay } from '../common/utils/date-range.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  getConversionFactorMap,
  requireFactor,
} from '../common/utils/unit-conversion.util';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

const recipeInclude = {
  product: true,
  recipeItems: {
    include: { material: true },
  },
};

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refuse ingredients whose unit cannot be converted into the material's
   * stock unit.
   *
   * Production consumption and costing both need that factor. Checking here
   * surfaces a missing conversion when the recipe is written — by the person
   * who can fix it — instead of on the next production save.
   */
  private async assertItemsConvertible(
    items: Array<{ materialId: number; unit: MeasurementUnit }>,
  ): Promise<void> {
    if (items.length === 0) return;

    const materialIds = [...new Set(items.map((i) => i.materialId))];
    const materials = await this.prisma.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
      select: { id: true, name: true, unit: true },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));

    const unknown = materialIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new NotFoundException(`Materials not found: ${unknown.join(', ')}`);
    }

    const pairs = items.map((i) => ({
      fromUnit: i.unit,
      toUnit: byId.get(i.materialId)!.unit,
    }));
    const map = await getConversionFactorMap(this.prisma, pairs);
    const missing = items.filter(
      (i) => !map.has(`${i.unit}->${byId.get(i.materialId)!.unit}`),
    );
    if (missing.length > 0) {
      const detail = missing
        .map((i) => {
          const m = byId.get(i.materialId)!;
          return `${m.name} (${i.unit}→${m.unit})`;
        })
        .join(', ');
      throw new UnprocessableEntityException(
        `No unit conversion for: ${detail}. Add it under Unit Conversions, ` +
          `or enter the ingredient in the material's own unit.`,
      );
    }
  }

  /**
   * Append a version: the recipe as it now stands, in force from today
   * (Manila). Every change goes through here, so the recipe for any past day
   * can still be read back (see recipe-version.util).
   */
  private async snapshot(
    tx: Prisma.TransactionClient,
    recipeId: number,
    retired = false,
  ): Promise<void> {
    const [recipe, last] = await Promise.all([
      tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        include: { recipeItems: true },
      }),
      tx.recipeVersion.findFirst({
        where: { recipeId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
    ]);
    await tx.recipeVersion.create({
      data: {
        recipeId,
        version: (last?.version ?? 0) + 1,
        effectiveFrom: toUtcDay(new Date()),
        recipeYield: recipe.recipeYield,
        retired,
        items: retired
          ? undefined
          : {
              create: recipe.recipeItems.map((i) => ({
                materialId: i.materialId,
                quantity: i.quantity,
                unit: i.unit,
              })),
            },
      },
    });
  }

  async create(body: CreateRecipeDto) {
    // Deleted recipes included: `Recipe.productId` is unique, so a
    // soft-deleted recipe still owns the product's slot and a plain insert
    // collides with it (P2002). Re-creating is a revive.
    const existing = await this.prisma.recipe.findFirst({
      where: { productId: body.productId },
    });
    if (existing && existing.deletedAt === null) {
      throw new ConflictException(
        `A recipe for product ${body.productId} already exists`,
      );
    }

    await this.assertItemsConvertible(body.items);

    if (existing) {
      return this.prisma.$transaction(async (tx) => {
        // The current ingredient list is replaced; the deleted recipe's
        // earlier versions keep what it was.
        await tx.recipeItem.deleteMany({ where: { recipeId: existing.id } });
        await tx.recipe.update({
          where: { id: existing.id },
          data: {
            recipeYield: body.recipeYield ?? 1,
            notes: body.notes ?? null,
            deletedAt: null,
            recipeItems: {
              create: body.items.map((item) => ({
                materialId: item.materialId,
                quantity: item.quantity,
                unit: item.unit,
              })),
            },
          },
        });
        await this.snapshot(tx, existing.id);
        return tx.recipe.findUniqueOrThrow({
          where: { id: existing.id },
          include: recipeInclude,
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.recipe.create({
        data: {
          productId: body.productId,
          recipeYield: body.recipeYield,
          notes: body.notes,
          recipeItems: {
            create: body.items.map((item) => ({
              materialId: item.materialId,
              quantity: item.quantity,
              unit: item.unit,
            })),
          },
        },
        include: recipeInclude,
      });
      await this.snapshot(tx, created.id);
      return created;
    });
  }

  findAll() {
    return this.prisma.recipe.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: recipeInclude,
    });
  }

  search(q: string) {
    return this.prisma.recipe.findMany({
      where: {
        deletedAt: null,
        OR: [
          { notes: { contains: q, mode: 'insensitive' } },
          { product: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: recipeInclude,
    });
  }

  async findOne(id: number) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, deletedAt: null },
      include: recipeInclude,
    });
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }
    return recipe;
  }

  async findByProduct(productId: number) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { productId, deletedAt: null },
      include: recipeInclude,
    });
    if (!recipe) {
      throw new NotFoundException('No recipe found for this product');
    }
    return recipe;
  }

  async update(id: number, body: UpdateRecipeDto) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, deletedAt: null },
    });
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    if (body.items !== undefined) {
      await this.assertItemsConvertible(body.items);
    }

    return this.prisma.$transaction(async (tx) => {
      if (body.items !== undefined) {
        const existingItems = await tx.recipeItem.findMany({
          where: { recipeId: id },
        });
        const existingByMaterial = new Map(
          existingItems.map((e) => [e.materialId, e]),
        );
        const incomingIds = new Set(body.items.map((i) => i.materialId));

        for (const item of body.items) {
          const ext = existingByMaterial.get(item.materialId);
          if (ext) {
            if (ext.quantity !== item.quantity || ext.unit !== item.unit) {
              await tx.recipeItem.update({
                where: { id: ext.id },
                data: { quantity: item.quantity, unit: item.unit },
              });
            }
          } else {
            await tx.recipeItem.create({
              data: {
                recipeId: id,
                materialId: item.materialId,
                quantity: item.quantity,
                unit: item.unit,
              },
            });
          }
        }

        for (const ext of existingItems) {
          if (!incomingIds.has(ext.materialId)) {
            await tx.recipeItem.delete({ where: { id: ext.id } });
          }
        }
      }

      const updated = await tx.recipe.update({
        where: { id },
        data: { recipeYield: body.recipeYield, notes: body.notes },
        include: recipeInclude,
      });
      // A notes-only edit does not change how the product is made.
      const changesRecipe =
        body.items !== undefined ||
        (body.recipeYield !== undefined && body.recipeYield !== recipe.recipeYield);
      if (changesRecipe) await this.snapshot(tx, id);
      return updated;
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.recipe.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Recipe not found');
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.recipe.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      // From today the product has no recipe; earlier days keep theirs.
      await this.snapshot(tx, id, true);
      return removed;
    });
  }

  /**
   * Calculate the material cost for one batch of this recipe and the
   * derived cost per product unit (batch cost / recipeYield).
   *
   * Unit conversions are batch-fetched in a single query rather than
   * one query per ingredient (avoids N+1).
   */
  async calculateCost(id: number) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, deletedAt: null },
      include: {
        product: true,
        recipeItems: { include: { material: true } },
      },
    });
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    const conversionMap = await getConversionFactorMap(
      this.prisma,
      recipe.recipeItems.map((item) => ({
        fromUnit: item.unit,
        toUnit: item.material.unit,
      })),
    );

    const itemCosts = recipe.recipeItems.map((item) => {
      const factor = requireFactor(
        conversionMap,
        item.unit,
        item.material.unit,
        item.material.name,
      );
      const quantityInBaseUnit = item.quantity * factor;
      const cost = quantityInBaseUnit * item.material.pricePerUnit.toNumber();
      return {
        materialId: item.material.id,
        materialName: item.material.name,
        quantity: item.quantity,
        unit: item.unit,
        quantityInBaseUnit,
        baseUnit: item.material.unit,
        pricePerUnit: item.material.pricePerUnit.toNumber(),
        cost,
      };
    });

    const totalBatchCost = itemCosts.reduce((sum, i) => sum + i.cost, 0);
    const costPerUnit = totalBatchCost / recipe.recipeYield;
    const productPrice = Number(recipe.product.price);
    const grossProfitPerUnit = productPrice - costPerUnit;
    const grossMarginPercent =
      productPrice > 0 ? grossProfitPerUnit / productPrice : 0;

    return {
      recipeId: recipe.id,
      productId: recipe.productId,
      productName: recipe.product.name,
      productPrice,
      recipeYield: recipe.recipeYield,
      items: itemCosts,
      totalBatchCost,
      costPerUnit,
      grossProfitPerUnit,
      grossMarginPercent,
    };
  }
}
