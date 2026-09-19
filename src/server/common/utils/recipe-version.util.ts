import { Prisma } from '@prisma/client';
import { getEffectivePrice } from './price-history.util';

/**
 * "What was the recipe, and what did its materials cost, on day D?"
 *
 * Recipes are versioned (RecipeVersion) and material prices are dated
 * (MaterialPriceHistory), so consumption and costing for a past day use that
 * day's recipe and prices (decision 2026-09-19) rather than today's.
 */

type Client = Pick<Prisma.TransactionClient, 'recipeVersion' | 'materialPriceHistory'>;

export type RecipeVersionWithItems = Prisma.RecipeVersionGetPayload<{
  include: {
    recipe: { select: { productId: true } };
    items: { include: { material: true } };
  };
}>;

/** Every version of each product's recipe, oldest first. */
export async function loadRecipeVersions(
  client: Client,
  productIds: number[],
): Promise<Map<number, RecipeVersionWithItems[]>> {
  const byProduct = new Map<number, RecipeVersionWithItems[]>();
  if (productIds.length === 0) return byProduct;

  const versions = await client.recipeVersion.findMany({
    where: { recipe: { productId: { in: [...new Set(productIds)] } } },
    include: {
      recipe: { select: { productId: true } },
      items: { include: { material: true } },
    },
    orderBy: [{ effectiveFrom: 'asc' }, { version: 'asc' }],
  });
  for (const v of versions) {
    const list = byProduct.get(v.recipe.productId) ?? [];
    list.push(v);
    byProduct.set(v.recipe.productId, list);
  }
  return byProduct;
}

/**
 * The version in force on `date`: the latest effective on or before it. A
 * day before the first version uses the first (a recipe written today also
 * describes how the product was made before it was typed in). A retired
 * version means the recipe was deleted: nothing is consumed or costed.
 *
 * `versions` must be oldest first, as loadRecipeVersions returns them.
 */
export function recipeOn(
  versions: RecipeVersionWithItems[] | undefined,
  date: Date,
): RecipeVersionWithItems | null {
  if (!versions || versions.length === 0) return null;
  let current = versions[0];
  for (const v of versions) {
    if (v.effectiveFrom.getTime() <= date.getTime()) current = v;
    else break;
  }
  return current.retired ? null : current;
}

export type MaterialPriceMap = Map<number, { price: number; effectiveAt: Date }[]>;

/** Price history for the given materials, oldest first (id breaks same-day ties). */
export async function loadMaterialPrices(
  client: Client,
  materialIds: number[],
): Promise<MaterialPriceMap> {
  const map: MaterialPriceMap = new Map();
  if (materialIds.length === 0) return map;
  const rows = await client.materialPriceHistory.findMany({
    where: { materialId: { in: [...new Set(materialIds)] } },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });
  for (const r of rows) {
    const list = map.get(r.materialId) ?? [];
    list.push({ price: r.pricePerUnit.toNumber(), effectiveAt: r.effectiveAt });
    map.set(r.materialId, list);
  }
  return map;
}

/** A material's price on `date`; its current price only if it has no history. */
export function materialPriceOn(
  material: { id: number; pricePerUnit: { toNumber(): number } },
  date: Date,
  prices: MaterialPriceMap,
): number {
  return getEffectivePrice(material.id, date, material.pricePerUnit.toNumber(), prices);
}
