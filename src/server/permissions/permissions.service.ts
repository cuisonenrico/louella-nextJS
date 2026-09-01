import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePermissions } from './resolve-permissions';
import {
  ADMIN_LOCKED_KEYS,
  FEATURE_BY_KEY,
  PERMISSION_LIST,
  ROLE_DEFAULTS,
  ROLE_RANK,
  isPermissionKey,
  type PermissionDef,
  type RoleName,
} from '@/lib/rbac/features';

/** Roles an admin can actually configure. USER is the unprovisioned default. */
const CONFIGURABLE_ROLES = Object.values(UserRole).filter(
  (r) => r !== UserRole.USER,
) as Exclude<UserRole, 'USER'>[];

/**
 * Reads and writes the feature permission matrix.
 *
 * Note there is no cache here. Permissions are resolved per request inside
 * JwtStrategy's existing user lookup, so a toggle takes effect on the very next
 * request. The previous 5-minute in-process Map could not do that on
 * serverless: invalidation only cleared the instance that handled the write,
 * leaving every other warm lambda serving stale permissions — tolerable while
 * this only drove navigation, but not now that it is an authorization boundary.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The role matrix: every grantable key, every configurable role.
   *
   * Rows are `PERMISSION_LIST`, so each feature is followed by its own actions
   * and panels. `parent` tells the UI which rows nest under which; `available`
   * tells it which grants the role hierarchy would refuse anyway.
   */
  async getMatrix() {
    const roleOverrides = await this.prisma.roleFeaturePermission.findMany();

    const overrideMap = new Map<string, boolean>();
    for (const o of roleOverrides) {
      overrideMap.set(`${o.role}:${o.featureKey}`, o.enabled);
    }

    const own = (role: string, key: string): boolean => {
      const def = (ROLE_DEFAULTS[role as RoleName] ?? []).includes(key as never);
      return overrideMap.get(`${role}:${key}`) ?? def;
    };

    return {
      features: PERMISSION_LIST.map((p) => {
        const roles: Record<
          string,
          {
            default: boolean;
            effective: boolean;
            overridden: boolean;
            locked: boolean;
            available: boolean;
          }
        > = {};

        for (const role of CONFIGURABLE_ROLES) {
          const def = (ROLE_DEFAULTS[role as RoleName] ?? []).includes(
            p.key as never,
          );
          const override = overrideMap.get(`${role}:${p.key}`);
          const overridden = override !== undefined;
          roles[role] = {
            default: def,
            // A child is only ever effective while its parent is, matching
            // `enforceParentRule` in the manifest. Without this the matrix
            // could show a delete grant as live on a screen the role cannot
            // reach, which the guards would then disagree with.
            effective:
              (override ?? def) && (p.parent === null || own(role, p.parent)),
            overridden,
            // Surfaced so the UI can render the switch disabled and explain why,
            // rather than letting an admin discover the rule via a 400.
            locked:
              role === UserRole.ADMIN &&
              (ADMIN_LOCKED_KEYS as readonly string[]).includes(p.key),
            available: this.isAvailableTo(p, role),
          };
        }

        return { ...this.describe(p), roles };
      }),
    };
  }

  /**
   * One row per feature for a single user.
   *
   * The previous implementation returned this user's override stamped across
   * every role column, which happened to render correctly only because the UI
   * read a single column. This returns what the question actually is: for this
   * user, what does their role give them, what has been overridden, and what is
   * the net result.
   */
  async getUserMatrix(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const [roleOverrides, userOverrides] = await Promise.all([
      this.prisma.roleFeaturePermission.findMany({ where: { role: user.role } }),
      this.prisma.userFeaturePermission.findMany({ where: { userId } }),
    ]);

    const roleOverrideMap = new Map(roleOverrides.map((o) => [o.featureKey, o.enabled]));
    const userOverrideMap = new Map(userOverrides.map((o) => [o.featureKey, o.enabled]));

    const effective = new Set(
      resolvePermissions(
        user.role as RoleName,
        roleOverrides.map((o) => ({ k: o.featureKey, e: o.enabled })),
        userOverrides.map((o) => ({ k: o.featureKey, e: o.enabled })),
      ),
    );

    const own = (key: string): boolean => {
      const def = (ROLE_DEFAULTS[user.role as RoleName] ?? []).includes(
        key as never,
      );
      return userOverrideMap.get(key) ?? roleOverrideMap.get(key) ?? def;
    };

    return {
      user,
      features: PERMISSION_LIST.map((p) => {
        const roleDefault = (ROLE_DEFAULTS[user.role as RoleName] ?? []).includes(
          p.key as never,
        );
        const roleOverride = roleOverrideMap.get(p.key);
        return {
          ...this.describe(p),
          roleDefault,
          roleEffective: roleOverride ?? roleDefault,
          userOverride: userOverrideMap.get(p.key) ?? null,
          effective: effective.has(p.key),
          parentEffective: p.parent === null ? true : own(p.parent),
          available: this.isAvailableTo(p, user.role),
          locked:
            user.role === UserRole.ADMIN &&
            (ADMIN_LOCKED_KEYS as readonly string[]).includes(p.key),
        };
      }),
    };
  }

  /** The manifest metadata every matrix row carries, shared by both endpoints. */
  private describe(p: PermissionDef) {
    // Children inherit their parent's nav group so the UI can nest them under
    // the same heading without a second lookup.
    const owner = FEATURE_BY_KEY.get(p.parent ?? p.key);
    return {
      key: p.key,
      label: p.label,
      description: p.description,
      parent: p.parent,
      kind: p.kind,
      minRole: p.minRole ?? null,
      sensitivity: p.sensitivity ?? null,
      group: owner?.nav?.group ?? null,
      platform: owner?.platform ?? 'web',
    };
  }

  /**
   * Whether the role hierarchy would honour this grant at all.
   *
   * An action's endpoints still carry `@Roles()`, so granting
   * `products:delete` to VIEWER would produce a control that 403s. The matrix
   * renders those cells unavailable rather than offering a grant that cannot
   * work.
   */
  private isAvailableTo(p: PermissionDef, role: string): boolean {
    if (!p.minRole) return true;
    return ROLE_RANK[role as RoleName] >= ROLE_RANK[p.minRole];
  }

  async setRolePermission(
    role: UserRole,
    featureKey: string,
    enabled: boolean,
    updatedById: number,
  ) {
    this.assertKnownFeature(featureKey);
    this.assertNotSelfLockout(role, featureKey, enabled);

    return this.prisma.roleFeaturePermission.upsert({
      where: { role_featureKey: { role, featureKey } },
      update: { enabled, updatedById },
      create: { role, featureKey, enabled, updatedById },
    });
  }

  async setUserPermission(
    userId: number,
    featureKey: string,
    enabled: boolean,
    updatedById: number,
  ) {
    this.assertKnownFeature(featureKey);

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    this.assertNotSelfLockout(target.role, featureKey, enabled);

    return this.prisma.userFeaturePermission.upsert({
      where: { userId_featureKey: { userId, featureKey } },
      update: { enabled, updatedById },
      create: { userId, featureKey, enabled, updatedById },
    });
  }

  async resetUserPermission(userId: number, featureKey: string) {
    this.assertKnownFeature(featureKey);
    await this.prisma.userFeaturePermission.deleteMany({ where: { userId, featureKey } });
    return { success: true };
  }

  private assertKnownFeature(featureKey: string): void {
    if (!isPermissionKey(featureKey)) {
      throw new BadRequestException(`Unknown feature "${featureKey}"`);
    }
  }

  /**
   * Refuse to revoke an admin's access to the screens that grant access.
   *
   * Disabling `permissions` or `user-management` for ADMIN would make the
   * screen that undoes the change unreachable, leaving hand-written SQL as the
   * only recovery. Enforced here rather than only in the UI, since the endpoint
   * is reachable directly.
   */
  private assertNotSelfLockout(
    role: UserRole,
    featureKey: string,
    enabled: boolean,
  ): void {
    if (
      !enabled &&
      role === UserRole.ADMIN &&
      (ADMIN_LOCKED_KEYS as readonly string[]).includes(featureKey)
    ) {
      throw new BadRequestException(
        `"${featureKey}" cannot be disabled for ADMIN — doing so would make the permissions screen unreachable`,
      );
    }
  }
}
