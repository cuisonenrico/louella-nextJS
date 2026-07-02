/**
 * Pure helpers for spreadsheet-style editable grids (inventory details,
 * production board).
 *
 * Kept free of React/DOM so the navigation ordering and input parsing can be
 * unit-tested without a jsdom focus simulation. The DOM-focus glue lives in
 * components/sheet/useSheetNavigation.
 */

/**
 * Coerce a raw text-input value into a non-negative integer quantity.
 * Everything from the first decimal point onward is dropped (so a pasted
 * "12.5" becomes 12, not 125), then any remaining non-digit characters are
 * stripped (so a pasted "1,234" becomes 1234, and negatives are blocked).
 * An empty result is treated as 0 — preserving the previous behaviour of the
 * number inputs.
 */
export function sanitizeQuantity(raw: string): number {
  const wholePart = raw.split('.', 1)[0];
  const digits = wholePart.replace(/[^0-9]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * Clean a raw text-input value for decimal quantity entry, preserving the
 * user's in-progress text: strips everything except digits and dots, then
 * keeps only the first dot (so "12..5" → "12.5", "1,234.5" → "1234.5",
 * negatives are blocked). Returns the cleaned *string* so a trailing dot
 * ("12.") survives while typing; parse with `parseQuantityText`.
 */
export function sanitizeDecimalText(raw: string): string {
  const chars = raw.replace(/[^0-9.]/g, '');
  const firstDot = chars.indexOf('.');
  if (firstDot === -1) return chars;
  return chars.slice(0, firstDot + 1) + chars.slice(firstDot + 1).replace(/\./g, '');
}

/**
 * Parse a cleaned quantity string into a non-negative number; empty or
 * dot-only input is 0.
 */
export function parseQuantityText(text: string): number {
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Return the neighbour of `current` in an ordered list, `dir` steps away
 * (+1 = next, -1 = previous), or `null` if `current` is missing or the step
 * falls off either end. Used for both column navigation (row-id lists) and
 * linear navigation (input-id lists); the cursor stops at the bounds rather
 * than wrapping, matching Excel.
 */
export function neighbor<T>(list: T[], current: T, dir: 1 | -1): T | null {
  const i = list.indexOf(current);
  if (i === -1) return null;
  const j = i + dir;
  if (j < 0 || j >= list.length) return null;
  return list[j];
}
