import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ROLE_DEFAULTS } from '@/lib/rbac/features';
import { JwtStrategy } from './jwt.strategy';

type Row = {
  id: number;
  email: string;
  role: string;
  branchId: number | null;
  isActive: boolean;
  role_overrides?: { k: string; e: boolean }[];
  user_overrides?: { k: string; e: boolean }[];
};

function makeStrategy(row: Row | null) {
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  const $queryRaw = jest
    .fn()
    .mockResolvedValue(
      row === null
        ? []
        : [{ role_overrides: [], user_overrides: [], ...row }],
    );
  const prisma = { $queryRaw } as any;
  return { strategy: new JwtStrategy(config, prisma), $queryRaw };
}

const payload = { sub: '5', email: 'a@b.com', role: 'USER', branchId: null };

describe('JwtStrategy.validate', () => {
  it('returns the user with role/branch sourced from the database', async () => {
    const { strategy } = makeStrategy({
      id: 5,
      email: 'a@b.com',
      role: 'MANAGER',
      branchId: 3,
      isActive: true,
    });

    const result = await strategy.validate(payload);

    // DB is authoritative — a stale token role must not win
    expect(result).toMatchObject({
      id: 5,
      email: 'a@b.com',
      role: 'MANAGER',
      branchId: 3,
    });
  });

  it('rejects when the user no longer exists', async () => {
    const { strategy } = makeStrategy(null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the user has been deactivated', async () => {
    const { strategy } = makeStrategy({
      id: 5,
      email: 'a@b.com',
      role: 'USER',
      branchId: null,
      isActive: false,
    });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  describe('permission resolution', () => {
    it('resolves everything in a single database round trip', async () => {
      // The whole point of the raw query: the cross-region database makes every
      // extra statement expensive, so permissions must ride along with the auth
      // lookup that already happens on every request.
      const { strategy, $queryRaw } = makeStrategy({
        id: 5,
        email: 'a@b.com',
        role: 'VIEWER',
        branchId: null,
        isActive: true,
      });

      await strategy.validate(payload);
      expect($queryRaw).toHaveBeenCalledTimes(1);
    });

    it('falls back to the role defaults with no overrides stored', async () => {
      const { strategy } = makeStrategy({
        id: 5,
        email: 'a@b.com',
        role: 'VIEWER',
        branchId: null,
        isActive: true,
      });

      const result = await strategy.validate(payload);
      expect(result.permissions.sort()).toEqual([...ROLE_DEFAULTS.VIEWER].sort());
    });

    it('applies a role override on top of the defaults', async () => {
      const { strategy } = makeStrategy({
        id: 5,
        email: 'a@b.com',
        role: 'VIEWER',
        branchId: null,
        isActive: true,
        role_overrides: [{ k: 'products', e: true }],
      });

      const result = await strategy.validate(payload);
      expect(result.permissions).toContain('products');
    });

    it('lets a user override win over the role override', async () => {
      const { strategy } = makeStrategy({
        id: 5,
        email: 'a@b.com',
        role: 'VIEWER',
        branchId: null,
        isActive: true,
        role_overrides: [{ k: 'products', e: true }],
        user_overrides: [{ k: 'products', e: false }],
      });

      const result = await strategy.validate(payload);
      expect(result.permissions).not.toContain('products');
    });

    it('revokes a default the user has been denied', async () => {
      const { strategy } = makeStrategy({
        id: 5,
        email: 'a@b.com',
        role: 'VIEWER',
        branchId: null,
        isActive: true,
        user_overrides: [{ k: 'dashboard', e: false }],
      });

      const result = await strategy.validate(payload);
      expect(result.permissions).not.toContain('dashboard');
    });

    it('grants nothing to an unprovisioned USER', async () => {
      const { strategy } = makeStrategy({
        id: 5,
        email: 'a@b.com',
        role: 'USER',
        branchId: null,
        isActive: true,
      });

      const result = await strategy.validate(payload);
      expect(result.permissions).toEqual([]);
    });
  });
});
