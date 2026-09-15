import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { ALL_BRANCHES_KEY } from '@/lib/rbac/features';

/**
 * Enforces branch-level data isolation.
 *
 * Scope is driven by the `all-branches` permission, not by the role:
 *
 *   holds `all-branches`            -> unscoped, every branch visible
 *   lacks it, `branchId` assigned   -> confined to that branch
 *   lacks it, no `branchId`         -> 403
 *
 * That last line is the important one. This guard previously keyed off
 * `role === MANAGER` and returned true for everyone else, which meant a MANAGER
 * created without a branch assignment - `User.branchId` is nullable - fell
 * through unscoped and could read every branch in the business. Absence of
 * scope information now denies rather than permits.
 *
 * Making scope a permission also means an admin can grant one senior manager
 * cross-branch visibility without promoting them to ADMIN, and that the rule is
 * visible in the permission matrix instead of buried here. `ROLE_DEFAULTS`
 * grants `all-branches` to every role except MANAGER, exactly reproducing the
 * behaviour this guard had before.
 *
 * When scoped:
 *   - a `branchId` in the path or query must match the user's own, else 403
 *   - a request carrying no `branchId` has the user's own injected into
 *     `req.query`, so downstream services scope automatically
 *   - for writes the branchId travels in the body, so the body is checked too:
 *     a mismatch is rejected, an absent value is stamped. This closes the
 *     write-side isolation bypass.
 */
/**
 * Replace `req.query` with a copy whose `branchId` is the user's own.
 *
 * Assigning into `req.query` does nothing under Express 5: `query` is a
 * getter on the request prototype that re-parses the URL on every read, so a
 * write lands on a throwaway object and the handler's `@Query('branchId')`
 * sees the original (usually absent) value. That silently unscoped every
 * listing and every `:id` read/write for branch-confined users. Defining an
 * own property shadows the getter, so the stamp survives to the handler.
 */
function pinQueryBranchId(req: Request, branchId: number): void {
  const query = { ...(req.query as Record<string, unknown> | undefined), branchId: String(branchId) };
  Object.defineProperty(req, 'query', {
    value: query,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

@Injectable()
export class BranchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & {
        user?: { role: string; branchId?: number | null; permissions?: string[] };
      }
    >();
    const user = req.user;

    // No authenticated user means a @Public route: JwtAuthGuard runs globally
    // and ahead of this one, so there is nothing to scope. Scoping is not this
    // guard's authentication decision to make.
    if (!user) return true;

    if (user.permissions?.includes(ALL_BRANCHES_KEY)) return true;

    // Scoped, but with nothing to scope to. Deny rather than fall through.
    if (user.branchId == null) {
      throw new ForbiddenException(
        'This account is limited to a single branch but has no branch assigned. Ask an administrator to assign one.',
      );
    }

    this.enforceScope(req, user.branchId);
    return true;
  }

  private enforceScope(
    req: Request & { user?: unknown },
    branchId: number,
  ): void {
    // Validate / stamp the branchId carried in the request body (writes).
    this.enforceBodyBranch(req.body, branchId);

    const paramBranchIdRaw = req.params?.branchId;
    const paramBranchId =
      paramBranchIdRaw != null && paramBranchIdRaw !== ''
        ? parseInt(
            Array.isArray(paramBranchIdRaw)
              ? paramBranchIdRaw[0]
              : paramBranchIdRaw,
            10,
          )
        : null;
    const rawQuery = req.query?.branchId;
    const queryBranchIdStr: string | undefined = Array.isArray(rawQuery)
      ? (rawQuery[0] as string | undefined)
      : typeof rawQuery === 'string'
        ? rawQuery
        : undefined;
    const queryBranchId =
      queryBranchIdStr != null && queryBranchIdStr !== ''
        ? parseInt(queryBranchIdStr, 10)
        : null;
    const requestedBranchId = paramBranchId ?? queryBranchId;

    if (requestedBranchId != null && requestedBranchId !== branchId) {
      throw new ForbiddenException('Access to this branch is not permitted');
    }

    // Always pin the query to the user's own branch — also when it already
    // matched, so a repeated (`?branchId=3&branchId=5`) or nested
    // (`?branchId[x]=5`) value cannot reach a handler that parses it
    // differently from the check above.
    pinQueryBranchId(req, branchId);
  }

  /**
   * Every record in the body must belong to the user's branch.
   * Reject an explicit mismatch; stamp the branchId when absent.
   * Handles both a single object body and an array body (bulk endpoints).
   */
  private enforceBodyBranch(body: unknown, branchId: number): void {
    if (Array.isArray(body)) {
      for (const item of body) {
        this.enforceItemBranch(item, branchId);
      }
    } else {
      this.enforceItemBranch(body, branchId);
    }
  }

  private enforceItemBranch(item: unknown, branchId: number): void {
    if (item == null || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const raw = record.branchId;
    if (raw == null || raw === '') {
      record.branchId = branchId;
      return;
    }
    const value = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (value !== branchId) {
      throw new ForbiddenException('Access to this branch is not permitted');
    }
  }
}
