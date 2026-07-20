/**
 * Fills every product whose current yield is 0 with its suggested quantity.
 * Non-zero values the user already typed are never overwritten.
 */
export function applyAllSuggestions(
  items: Map<number, number>,
  suggestedByProduct: Map<number, number>,
): Map<number, number> {
  const next = new Map(items);
  for (const [productId, qty] of suggestedByProduct) {
    if ((next.get(productId) ?? 0) === 0) next.set(productId, qty);
  }
  return next;
}
