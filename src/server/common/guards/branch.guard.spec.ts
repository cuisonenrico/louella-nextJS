import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ALL_BRANCHES_KEY, ROLE_DEFAULTS } from '@/lib/rbac/features';
import { BranchGuard } from './branch.guard';

type ReqShape = {
  user?: { role: string; branchId?: number | null; permissions?: string[] };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
};

function makeContext(req: ReqShape) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

/** A user confined to one branch: no `all-branches`, with a branch assigned. */
function scoped(branchId: number | null, role: string = UserRole.MANAGER) {
  return { role, branchId, permissions: ['dashboard'] };
}

/** A user who may see every branch. */
function unscoped(role: string = UserRole.ADMIN) {
  return { role, branchId: null, permissions: [ALL_BRANCHES_KEY] };
}

describe('BranchGuard', () => {
  const guard = new BranchGuard();

  describe('scope is a permission, not a role', () => {
    it('lets an all-branches holder through untouched', () => {
      const req: ReqShape = {
        user: unscoped(),
        body: { branchId: 2, productId: 5 },
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect((req.body as { branchId: number }).branchId).toBe(2);
    });

    it('scopes anyone without the key, whatever their role', () => {
      // An ADMIN who has had `all-branches` revoked is confined like anyone
      // else. Before, this guard keyed off `role === MANAGER` and no other role
      // could ever be scoped.
      const req: ReqShape = { user: scoped(3, UserRole.ADMIN), query: {} };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect(req.query?.branchId).toBe('3');
    });

    it('denies a scoped user who has no branch assigned', () => {
      // The hole this closes: `User.branchId` is nullable, and the guard used
      // to return true when it was null. A manager created without a branch was
      // therefore unscoped across every branch in the business.
      const req: ReqShape = { user: scoped(null), query: {} };
      expect(() => guard.canActivate(makeContext(req))).toThrow(ForbiddenException);
    });

    it('leaves an unauthenticated request alone', () => {
      // @Public routes never reach a user; authentication is JwtAuthGuard's job,
      // and there is nothing to scope.
      const req: ReqShape = { query: {} };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect(req.query?.branchId).toBeUndefined();
    });
  });

  describe('role defaults reproduce the previous behaviour', () => {
    it('grants all-branches to every provisioned role except MANAGER', () => {
      // The guard only ever scoped MANAGER, so shipping any other default here
      // would silently change who can see what.
      for (const role of ['VIEWER', 'INVENTORY', 'ADMIN'] as const) {
        expect(ROLE_DEFAULTS[role]).toContain(ALL_BRANCHES_KEY);
      }
      expect(ROLE_DEFAULTS.MANAGER).not.toContain(ALL_BRANCHES_KEY);
    });

    it('leaves the unprovisioned USER without it, harmlessly', () => {
      // USER holds nothing. Every controller carrying BranchGuard also carries
      // a feature requirement, and FeatureGuard is global so it runs first —
      // USER is refused before BranchGuard is ever consulted.
      expect(ROLE_DEFAULTS.USER).toEqual([]);
    });
  });

  describe('param/query scoping (regression)', () => {
    it('rejects a param branchId that is not the user branch', () => {
      const req: ReqShape = { user: scoped(1), params: { branchId: '2' } };
      expect(() => guard.canActivate(makeContext(req))).toThrow(ForbiddenException);
    });

    it('injects the user branch into query when none is requested', () => {
      const req: ReqShape = { user: scoped(1), query: {} };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect(req.query?.branchId).toBe('1');
    });
  });

  describe('body scoping', () => {
    it('rejects an object body that targets another branch', () => {
      const req: ReqShape = {
        user: scoped(1),
        body: { branchId: 2, productId: 5, date: '2026-06-12', quantity: 10 },
      };
      expect(() => guard.canActivate(makeContext(req))).toThrow(ForbiddenException);
    });

    it('stamps the user branch onto an object body with no branchId', () => {
      const req: ReqShape = {
        user: scoped(1),
        body: { productId: 5, date: '2026-06-12', quantity: 10 },
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect((req.body as { branchId: number }).branchId).toBe(1);
    });

    it('allows an object body that targets the user own branch', () => {
      const req: ReqShape = { user: scoped(1), body: { branchId: 1, productId: 5 } };
      expect(guard.canActivate(makeContext(req))).toBe(true);
    });

    it('rejects an array body where any item targets another branch', () => {
      const req: ReqShape = {
        user: scoped(1),
        body: [
          { branchId: 1, productId: 5 },
          { branchId: 2, productId: 6 },
        ],
      };
      expect(() => guard.canActivate(makeContext(req))).toThrow(ForbiddenException);
    });

    it('stamps the user branch onto array items missing branchId', () => {
      const req: ReqShape = { user: scoped(1), body: [{ productId: 5 }, { productId: 6 }] };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect((req.body as Array<{ branchId: number }>)[0].branchId).toBe(1);
      expect((req.body as Array<{ branchId: number }>)[1].branchId).toBe(1);
    });
  });
});
