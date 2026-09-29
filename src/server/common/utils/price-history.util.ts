import { Prisma } from '@prisma/client';
import { centavos, num } from './decimal.util';

/**
 * Returns the most recent price from historyByProduct whose effectiveAt is
 * on or before `date`.
 *
 * For a date earlier than every entry, the **earliest** recorded price is
 * used. It used to fall back to the product's current price, which revalued
 * all sales before a product's first price change at the new price. `fallback`
 * (the current price) now applies only when the product has no history at all,
 * where it is the only price there has ever been.
 *
 * historyByProduct entries MUST be sorted ascending by effectiveAt.
 */
export function getEffectivePrice(
  productId: number,
  date: Date,
  fallback: number,
  historyByProduct: Map<number, { price: number; effectiveAt: Date }[]>,
): number {
  const history = historyByProduct.get(productId) ?? [];
  if (history.length === 0) return fallback;
  let effectivePrice = history[0].price;
  for (const h of history) {
    if (h.effectiveAt <= date) {
      effectivePrice = h.price;
    } else {
      break;
    }
  }
  return effectivePrice;
}

export type PriceHistoryMap = Map<number, { price: number; effectiveAt: Date }[]>;

/**
 * Every recorded price for these products, oldest first, keyed by product —
 * the input getEffectivePrice expects. Sales, the inventory reads and the
 * dashboard all load it through here, so revenue is priced one way.
 */
export async function loadPriceHistory(
  db: Pick<Prisma.TransactionClient, 'productPriceHistory'>,
  productIds: number[],
): Promise<PriceHistoryMap> {
  const map: PriceHistoryMap = new Map();
  if (productIds.length === 0) return map;
  const histories = await db.productPriceHistory.findMany({
    where: { productId: { in: [...new Set(productIds)] } },
    // id breaks ties: two prices set on one day share an effectiveAt, and the
    // one entered later must win.
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
    select: { productId: true, price: true, effectiveAt: true },
  });
  for (const h of histories) {
    const list = map.get(h.productId) ?? [];
    list.push({ price: num(h.price), effectiveAt: h.effectiveAt });
    map.set(h.productId, list);
  }
  return map;
}

/** A row's revenue in centavos: sold × the price in force on its day. */
export function revenueCentavos(
  sold: number,
  row: { productId: number; date: Date; product: { price: number | { toNumber(): number } } },
  history: PriceHistoryMap,
): number {
  const current = typeof row.product.price === 'number' ? row.product.price : row.product.price.toNumber();
  return sold * centavos(getEffectivePrice(row.productId, row.date, current, history));
}
