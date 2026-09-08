import { ForbiddenException } from '@nestjs/common';
import { ALL_BRANCHES_KEY } from '@/lib/rbac/features';

/**
 * Branch isolation for domains BranchGuard cannot reach.
 *
 * BranchGuard covers the ordinary case: a `branchId` in the path, query or JSON
 * body. Two inventory domains fall outside it and must check in the service:
 *
 *   - `inventory-adjustments` addresses rows by `inventoryId` or adjustment
 *     `id` and never carries a branchId at all, so the branch has to be
 *     resolved from the row.
 *   - `inventory-import` carries its branchId in a **multipart** body, and
 *     multer is an interceptor — Nest runs interceptors *after* guards, so
 *     `req.body` is still empty when BranchGuard looks at it.
 *
 * Scope is driven by the `all-branches` permission, exactly as BranchGuard
 * does it, so both paths answer the same question the same way.
 */

/** The authenticated caller, as JwtStrategy puts it on the request. */
export interface RequestUser {
  id?: number;
  branchId?: number | null;
  permissions?: string[];
}

/** True when the caller may see every branch. */
export function hasAllBranches(user: RequestUser | undefined): boolean {
  return user?.permissions?.includes(ALL_BRANCHES_KEY) ?? false;
}

/**
 * Throws unless `user` may act on `branchId`.
 *
 * A missing user means a `@Public()` route: JwtAuthGuard runs globally and
 * ahead of every caller of this, so there is nothing to scope.
 */
export function assertBranchAccess(
  user: RequestUser | undefined,
  branchId: number,
): void {
  if (!user) return;
  if (hasAllBranches(user)) return;

  if (user.branchId == null) {
    throw new ForbiddenException(
      'This account is limited to a single branch but has no branch assigned. Ask an administrator to assign one.',
    );
  }
  if (user.branchId !== branchId) {
    throw new ForbiddenException('Access to this branch is not permitted');
  }
}

/**
 * Resolve the branch filter for a *listing*.
 *
 * An unscoped caller gets whatever they asked for, `undefined` included (all
 * branches). A scoped caller asking for someone else's branch is refused; one
 * asking for nothing in particular is confined to their own — the same
 * "stamp when absent, reject on mismatch" rule BranchGuard applies to queries.
 */
export function resolveBranchScope(
  user: RequestUser | undefined,
  requested?: number,
): number | undefined {
  if (!user || hasAllBranches(user)) return requested;

  if (user.branchId == null) {
    throw new ForbiddenException(
      'This account is limited to a single branch but has no branch assigned. Ask an administrator to assign one.',
    );
  }
  if (requested != null && requested !== user.branchId) {
    throw new ForbiddenException('Access to this branch is not permitted');
  }
  return user.branchId;
}
