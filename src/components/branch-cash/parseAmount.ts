/**
 * A peso amount as typed on a phone: "1,250.50", "₱850", " 60 ".
 * Returns null for anything that is not a positive amount with at most two
 * decimals — the same rule the API enforces.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/**
 * The counted cash: like parseAmount, but zero is a real count (an empty
 * drawer), however it is typed — "0", "0.00", "₱0".
 */
export function parseCashCount(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '');
  if (/^0+(\.0{1,2})?$/.test(cleaned)) return 0;
  return parseAmount(text);
}
