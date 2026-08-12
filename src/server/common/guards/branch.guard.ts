import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Enforces branch-level data isolation for MANAGER-role users.
 * MANAGERs are assigned to exactly one branch; they may only access that branch's data.
 *
 * When branchId appears in the request path or query:
 *   - If it matches the manager's own branchId → allow
 *   - If it does not match → 403 Forbidden
 *
 * When no branchId is present (all-branches endpoint):
 *   - The manager's own branchId is injected into req.query so downstream
 *     handlers and services automatically scope the query to their branch.
 *
 * For write requests the branchId travels in the body, not the path/query, so
 * the guard also inspects req.body (object or array). A body that targets a
 * different branch is rejected; a body with no branchId is stamped with the
 * manager's own branchId. This closes the write-side isolation bypass.
 *
 * Non-MANAGER roles and MANAGER users without an assigned branch pass through unchanged.
 */
@Injectable()
export class BranchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { role: string; branchId?: number | null } }
      >();
    const user = req.user;

    if (!user || user.role !== UserRole.MANAGER || user.branchId == null) {
      return true;
    }

    // Validate / stamp the branchId carried in the request body (writes).
    this.enforceBodyBranch(req.body, user.branchId);

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

    if (requestedBranchId != null) {
      if (requestedBranchId !== user.branchId) {
        throw new ForbiddenException('Access to this branch is not permitted');
      }
    } else if (req.query) {
      (req.query as Record<string, unknown>).branchId = String(user.branchId);
    }

    return true;
  }

  /**
   * For a manager, every record in the body must belong to their branch.
   * Reject an explicit mismatch; stamp the manager's branchId when absent.
   * Handles both a single object body and an array body (bulk endpoints).
   */
  private enforceBodyBranch(body: unknown, managerBranchId: number): void {
    if (Array.isArray(body)) {
      for (const item of body) {
        this.enforceItemBranch(item, managerBranchId);
      }
    } else {
      this.enforceItemBranch(body, managerBranchId);
    }
  }

  private enforceItemBranch(item: unknown, managerBranchId: number): void {
    if (item == null || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const raw = record.branchId;
    if (raw == null || raw === '') {
      record.branchId = managerBranchId;
      return;
    }
    const branchId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (branchId !== managerBranchId) {
      throw new ForbiddenException('Access to this branch is not permitted');
    }
  }
}
