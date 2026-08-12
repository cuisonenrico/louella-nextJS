import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly permCache = new Map<
    string,
    { value: string[]; expiresAt: number }
  >();

  private cacheKey(userId: number, role: UserRole): string {
    return `${userId}:${role}`;
  }

  private invalidateUser(userId: number): void {
    for (const key of this.permCache.keys()) {
      if (key.startsWith(`${userId}:`)) this.permCache.delete(key);
    }
  }

  private invalidateRole(role: UserRole): void {
    for (const key of this.permCache.keys()) {
      if (key.endsWith(`:${role}`)) this.permCache.delete(key);
    }
  }

  async getEffectivePermissions(
    userId: number,
    role: UserRole,
  ): Promise<string[]> {
    const key = this.cacheKey(userId, role);
    const cached = this.permCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const defaults = this.getDefaultsForRole(role);

    const [roleOverrides, userOverrides] = await Promise.all([
      this.prisma.roleFeaturePermission.findMany({ where: { role } }),
      this.prisma.userFeaturePermission.findMany({ where: { userId } }),
    ]);

    const effective = new Set(defaults);

    for (const o of roleOverrides) {
      if (o.enabled) effective.add(o.featureKey);
      else effective.delete(o.featureKey);
    }

    for (const o of userOverrides) {
      if (o.enabled) effective.add(o.featureKey);
      else effective.delete(o.featureKey);
    }

    const value = Array.from(effective);
    this.permCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  async getMatrix() {
    const [features, roleOverrides, allRoles] = await Promise.all([
      this.prisma.feature.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.roleFeaturePermission.findMany(),
      Promise.resolve(
        Object.values(UserRole).filter((r) => r !== UserRole.USER),
      ),
    ]);

    const overrideMap = new Map<string, { enabled: boolean }>();
    for (const o of roleOverrides) {
      overrideMap.set(`${o.role}:${o.featureKey}`, { enabled: o.enabled });
    }

    return {
      features: features.map((f) => {
        const roles: Record<
          string,
          { default: boolean; effective: boolean; overridden: boolean }
        > = {};
        for (const role of allRoles) {
          const def = this.getDefaultsForRole(role as UserRole).has(f.key);
          const override = overrideMap.get(`${role}:${f.key}`);
          const overridden = override !== undefined;
          const effective = overridden ? override.enabled : def;
          roles[role] = { default: def, effective, overridden };
        }
        return {
          key: f.key,
          label: f.label,
          description: f.description,
          roles,
        };
      }),
    };
  }

  async getUserMatrix(userId: number) {
    const [base, userOverrides] = await Promise.all([
      this.getMatrix(),
      this.prisma.userFeaturePermission.findMany({ where: { userId } }),
    ]);

    const userOverrideMap = new Map<string, boolean>();
    for (const o of userOverrides) {
      userOverrideMap.set(o.featureKey, o.enabled);
    }

    return {
      features: base.features.map((f) => {
        const roles: typeof f.roles = {};
        for (const [role, state] of Object.entries(f.roles)) {
          const userOverride = userOverrideMap.get(f.key);
          if (userOverride !== undefined) {
            roles[role] = {
              default: state.default,
              effective: userOverride,
              overridden: true,
            };
          } else {
            roles[role] = state;
          }
        }
        return { ...f, roles };
      }),
    };
  }

  async setRolePermission(
    role: UserRole,
    featureKey: string,
    enabled: boolean,
    updatedById: number,
  ) {
    const result = await this.prisma.roleFeaturePermission.upsert({
      where: { role_featureKey: { role, featureKey } },
      update: { enabled, updatedById },
      create: { role, featureKey, enabled, updatedById },
    });
    this.invalidateRole(role);
    return result;
  }

  async setUserPermission(
    userId: number,
    featureKey: string,
    enabled: boolean,
    updatedById: number,
  ) {
    const result = await this.prisma.userFeaturePermission.upsert({
      where: { userId_featureKey: { userId, featureKey } },
      update: { enabled, updatedById },
      create: { userId, featureKey, enabled, updatedById },
    });
    this.invalidateUser(userId);
    return result;
  }

  async resetUserPermission(userId: number, featureKey: string) {
    await this.prisma.userFeaturePermission.deleteMany({
      where: { userId, featureKey },
    });
    this.invalidateUser(userId);
    return { success: true };
  }

  getDefaultsForRole(role: UserRole): Set<string> {
    const defaults: Record<UserRole, string[]> = {
      USER: [],
      VIEWER: ['dashboard', 'analytics'],
      INVENTORY: ['quick-entry', 'inventory-history', 'notifications'],
      MANAGER: [
        'quick-entry',
        'inventory-history',
        'notifications',
        'dashboard',
        'branch-comparison',
        'waste-report',
        'low-stock',
        'approval-queue',
        'analytics',
      ],
      ADMIN: [
        'quick-entry',
        'inventory-history',
        'notifications',
        'dashboard',
        'branch-comparison',
        'waste-report',
        'low-stock',
        'approval-queue',
        'analytics',
        'user-management',
      ],
    };
    return new Set(defaults[role] ?? []);
  }
}
