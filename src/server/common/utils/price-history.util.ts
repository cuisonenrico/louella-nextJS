/**
 * Returns the most recent price from historyByProduct whose effectiveAt is
 * on or before `date`. Falls back to `fallback` if no qualifying entry exists.
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
  let effectivePrice = fallback;
  for (const h of history) {
    if (h.effectiveAt <= date) {
      effectivePrice = h.price;
    } else {
      break;
    }
  }
  return effectivePrice;
}
