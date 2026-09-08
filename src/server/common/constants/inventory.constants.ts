/**
 * Bounds shared by the inventory and material-stock domains.
 *
 * The DTOs previously carried `@Min(0)` and nothing else, so the only ceiling
 * on a quantity was the column's own 32-bit range — a fat-fingered
 * `999999999999` either landed as a real figure or surfaced as a Prisma
 * integer-overflow 500. Likewise `limit` was shape-checked by `ParseIntPipe`
 * and never bounded, so `?limit=1000000` asked for the whole table.
 */

/**
 * Ceiling on any per-day piece or weight count.
 *
 * A bakery day is thousands of pieces, not a million, so this rejects typos
 * without ever getting in the way of a real figure. Well below the 2.1bn the
 * `Int` columns allow, so a value that passes validation can always be stored.
 */
export const MAX_UNITS = 1_000_000;

/** Ceiling on free-text notes, which are unbounded `String?` in the schema. */
export const MAX_NOTES_LENGTH = 1_000;

/** Largest page any list endpoint will serve, however much is asked for. */
export const MAX_PAGE_SIZE = 200;

/** Page size used when the request does not ask for a sensible one. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Bound a caller-supplied page size. Nonsense (zero, negative, NaN) falls back
 * to the default rather than erroring: paging is a display concern, and a bad
 * `limit` should not fail a read the user is entitled to.
 */
export function clampPageSize(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}
