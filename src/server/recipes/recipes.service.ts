import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getConversionFactorMap } from '../common/utils/unit-conversion.util';
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

  async create(body: CreateRecipeDto) {
    const existing = await this.prisma.recipe.findFirst({
      where: { productId: body.productId, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `A recipe for product ${body.productId} already exists`,
      );
    }

    return this.prisma.recipe.create({
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

      return tx.recipe.update({
        where: { id },
        data: { recipeYield: body.recipeYield, notes: body.notes },
        include: recipeInclude,
      });
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.recipe.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Recipe not found');
    return this.prisma.recipe.update({
      where: { id },
      data: { deletedAt: new Date() },
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
      const factor =
        conversionMap.get(`${item.unit}->${item.material.unit}`) ?? 1;
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
