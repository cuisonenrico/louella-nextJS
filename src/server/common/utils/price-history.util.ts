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
