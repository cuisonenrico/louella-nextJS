import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BranchGuard } from './branch.guard';

type ReqShape = {
  user?: { role: string; branchId?: number | null };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
};

function makeContext(req: ReqShape) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('BranchGuard', () => {
  const guard = new BranchGuard();

  describe('non-manager users', () => {
    it('passes through without modifying the body', () => {
      const req: ReqShape = {
        user: { role: UserRole.ADMIN, branchId: null },
        body: { branchId: 2, productId: 5 },
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect((req.body as { branchId: number }).branchId).toBe(2);
    });
  });

  describe('manager param/query scoping (regression)', () => {
    it('rejects a param branchId that is not the manager branch', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        params: { branchId: '2' },
      };
      expect(() => guard.canActivate(makeContext(req))).toThrow(
        ForbiddenException,
      );
    });

    it('injects the manager branch into query when none is requested', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        query: {},
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect(req.query?.branchId).toBe('1');
    });
  });

  describe('manager body scoping (#1 fix)', () => {
    it('rejects an object body that targets another branch', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        body: { branchId: 2, productId: 5, date: '2026-06-12', quantity: 10 },
      };
      expect(() => guard.canActivate(makeContext(req))).toThrow(
        ForbiddenException,
      );
    });

    it('stamps the manager branch onto an object body with no branchId', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        body: { productId: 5, date: '2026-06-12', quantity: 10 },
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect((req.body as { branchId: number }).branchId).toBe(1);
    });

    it('allows an object body that targets the manager own branch', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        body: { branchId: 1, productId: 5 },
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
    });

    it('rejects an array body where any item targets another branch', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        body: [
          { branchId: 1, productId: 5 },
          { branchId: 2, productId: 6 },
        ],
      };
      expect(() => guard.canActivate(makeContext(req))).toThrow(
        ForbiddenException,
      );
    });

    it('stamps the manager branch onto array items missing branchId', () => {
      const req: ReqShape = {
        user: { role: UserRole.MANAGER, branchId: 1 },
        body: [{ productId: 5 }, { productId: 6 }],
      };
      expect(guard.canActivate(makeContext(req))).toBe(true);
      expect((req.body as Array<{ branchId: number }>)[0].branchId).toBe(1);
      expect((req.body as Array<{ branchId: number }>)[1].branchId).toBe(1);
    });
  });
});
