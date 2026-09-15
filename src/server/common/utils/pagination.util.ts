/**
 * Bounds for client-supplied pagination.
 *
 * `ParseIntPipe` only proves a value is an integer. Unbounded, `?limit=10000000`
 * made one authenticated request pull an entire table into a serverless
 * function's memory, and `?page=0` or a negative value produced a negative
 * `skip` that Prisma rejects as a 500. The largest page the web client asks
 * for is 200 (material inventory), so 500 leaves headroom without letting a
 * caller turn a list endpoint into a table dump.
 */
export const MAX_PAGE_SIZE = 500;

export function clampPageSize(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

export function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
