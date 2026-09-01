import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    roleFeaturePermission: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
    },
    userFeaturePermission: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 7,
        email: 'viewer@louella.com',
        role: UserRole.VIEWER,
        isActive: true,
      }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe('PermissionsService', () => {
  describe('getMatrix', () => {
    it('returns a row per feature with a column per configurable role', async () => {
      const service = new PermissionsService(makePrisma());
      const { features } = await service.getMatrix();

      expect(features.length).toBeGreaterThan(20);
      const dashboard = features.find((f) => f.key === 'dashboard')!;
      expect(Object.keys(dashboard.roles).sort()).toEqual(
        ['ADMIN', 'INVENTORY', 'MANAGER', 'VIEWER'].sort(),
      );
      // USER is the unprovisioned default and is not configurable.
      expect(dashboard.roles.USER).toBeUndefined();
    });

    it('reports the code default when no override exists', async () => {
      const service = new PermissionsService(makePrisma());
      const { features } = await service.getMatrix();
      const production = features.find((f) => f.key === 'production')!;

      expect(production.roles.MANAGER).toMatchObject({
        default: true,
        effective: true,
        overridden: false,
      });
      expect(production.roles.VIEWER).toMatchObject({
        default: false,
        effective: false,
        overridden: false,
      });
    });

    it('reports an override as effective and flags it as overridden', async () => {
      const prisma = makePrisma();
      (prisma.roleFeaturePermission.findMany as jest.Mock).mockResolvedValue([
        { role: UserRole.VIEWER, featureKey: 'products', enabled: true },
      ]);

      const service = new PermissionsService(prisma);
      const { features } = await service.getMatrix();
      const products = features.find((f) => f.key === 'products')!;

      expect(products.roles.VIEWER).toMatchObject({
        default: false,
        effective: true,
        overridden: true,
      });
    });

    it('marks the keys an admin may never lose as locked', async () => {
      const service = new PermissionsService(makePrisma());
      const { features } = await service.getMatrix();

      expect(features.find((f) => f.key === 'permissions')!.roles.ADMIN.locked).toBe(true);
      expect(features.find((f) => f.key === 'user-management')!.roles.ADMIN.locked).toBe(true);
      // Locking applies to ADMIN only — other roles can be denied these freely.
      expect(features.find((f) => f.key === 'permissions')!.roles.MANAGER.locked).toBe(false);
      expect(features.find((f) => f.key === 'products')!.roles.ADMIN.locked).toBe(false);
    });
  });

  describe('getUserMatrix', () => {
    it('distinguishes an inherited grant from an overridden one', async () => {
      const prisma = makePrisma();
      (prisma.userFeaturePermission.findMany as jest.Mock).mockResolvedValue([
        { featureKey: 'products', enabled: true },
      ]);

      const service = new PermissionsService(prisma);
      const { features } = await service.getUserMatrix(7);

      const products = features.find((f) => f.key === 'products')!;
      expect(products).toMatchObject({
        roleDefault: false,
        roleEffective: false,
        userOverride: true,
        effective: true,
      });

      const dashboard = features.find((f) => f.key === 'dashboard')!;
      expect(dashboard).toMatchObject({
        roleDefault: true,
        userOverride: null,
        effective: true,
      });
    });

    it('layers a user override on top of a role override', async () => {
      const prisma = makePrisma();
      (prisma.roleFeaturePermission.findMany as jest.Mock).mockResolvedValue([
        { role: UserRole.VIEWER, featureKey: 'products', enabled: true },
      ]);
      (prisma.userFeaturePermission.findMany as jest.Mock).mockResolvedValue([
        { featureKey: 'products', enabled: false },
      ]);

      const service = new PermissionsService(prisma);
      const { features } = await service.getUserMatrix(7);
      const products = features.find((f) => f.key === 'products')!;

      expect(products).toMatchObject({
        roleDefault: false,
        roleEffective: true,
        userOverride: false,
        effective: false,
      });
    });

    it('rejects an unknown user', async () => {
      const prisma = makePrisma();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(new PermissionsService(prisma).getUserMatrix(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('write guards', () => {
    it('rejects a feature key that does not exist', async () => {
      const service = new PermissionsService(makePrisma());
      await expect(
        service.setRolePermission(UserRole.MANAGER, 'prodcuts', true, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to revoke the permissions screen from ADMIN', async () => {
      // Allowing this would make the screen that undoes it unreachable, leaving
      // hand-written SQL as the only recovery.
      const service = new PermissionsService(makePrisma());
      await expect(
        service.setRolePermission(UserRole.ADMIN, 'permissions', false, 1),
      ).rejects.toThrow(/cannot be disabled for ADMIN/);
      await expect(
        service.setRolePermission(UserRole.ADMIN, 'user-management', false, 1),
      ).rejects.toThrow(/cannot be disabled for ADMIN/);
    });

    it('still allows granting those keys to ADMIN', async () => {
      const service = new PermissionsService(makePrisma());
      await expect(
        service.setRolePermission(UserRole.ADMIN, 'permissions', true, 1),
      ).resolves.toBeDefined();
    });

    it('allows revoking those keys from any non-admin role', async () => {
      const service = new PermissionsService(makePrisma());
      await expect(
        service.setRolePermission(UserRole.MANAGER, 'permissions', false, 1),
      ).resolves.toBeDefined();
    });

    it('applies the same lockout rule to per-user overrides', async () => {
      // The escalation is identical whether it is written at role or user level.
      const prisma = makePrisma();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: UserRole.ADMIN });

      const service = new PermissionsService(prisma);
      await expect(service.setUserPermission(1, 'permissions', false, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a per-user override for a user that does not exist', async () => {
      const prisma = makePrisma();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        new PermissionsService(prisma).setUserPermission(999, 'products', true, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes the override row when resetting', async () => {
      const prisma = makePrisma();
      await new PermissionsService(prisma).resetUserPermission(7, 'products');
      expect(prisma.userFeaturePermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: 7, featureKey: 'products' },
      });
    });
  });
});
