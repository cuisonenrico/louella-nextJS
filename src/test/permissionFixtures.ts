import {
  ADMIN_LOCKED_KEYS,
  FEATURE_BY_KEY,
  FEATURE_LIST,
  PERMISSION_LIST,
  ROLE_DEFAULTS,
  ROLE_RANK,
  type PermissionDef,
  type RoleName,
} from '@/lib/rbac/features';
import type {
  PermissionsMatrixResponse,
  PermissionRowMeta,
  UserPermissionsResponse,
  UserRole,
} from '@/types';

const CONFIGURABLE_ROLES: RoleName[] = ['VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'];

const isLocked = (role: string, key: string) =>
  role === 'ADMIN' && (ADMIN_LOCKED_KEYS as readonly string[]).includes(key);

const holdsByDefault = (role: string, key: string) =>
  (ROLE_DEFAULTS[role as RoleName] ?? []).includes(key as never);

const isAvailableTo = (p: PermissionDef, role: string) =>
  !p.minRole || ROLE_RANK[role as RoleName] >= ROLE_RANK[p.minRole];

/** Mirrors `PermissionsService.describe` — the metadata every row carries. */
function meta(p: PermissionDef): PermissionRowMeta {
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
 * A role matrix shaped exactly like `GET /permissions/matrix`.
 *
 * Derived from the real manifest rather than hand-written, so a feature, action
 * or panel added to the manifest shows up here too and these tests keep
 * describing the actual screen instead of a frozen copy of it.
 *
 * `overrides` is keyed `"ROLE:permission-key"`, matching how the server keys them.
 */
export function buildRoleMatrix(
  overrides: Record<string, boolean> = {},
): PermissionsMatrixResponse {
  const own = (role: string, key: string) =>
    overrides[`${role}:${key}`] ?? holdsByDefault(role, key);

  return {
    features: PERMISSION_LIST.map((p) => {
      const roles: PermissionsMatrixResponse['features'][number]['roles'] = {};
      for (const role of CONFIGURABLE_ROLES) {
        const def = holdsByDefault(role, p.key);
        const override = overrides[`${role}:${p.key}`];
        const overridden = override !== undefined;
        roles[role] = {
          default: def,
          // A child is only effective while its parent is, matching
          // `enforceParentRule`.
          effective:
            (override ?? def) && (p.parent === null || own(role, p.parent)),
          overridden,
          locked: isLocked(role, p.key),
          available: isAvailableTo(p, role),
        };
      }
      return { ...meta(p), roles };
    }),
  };
}

/** A per-user matrix shaped exactly like `GET /permissions/users/:id/matrix`. */
export function buildUserMatrix(
  user: { id: number; email: string; role: UserRole; isActive?: boolean },
  userOverrides: Record<string, boolean> = {},
  roleOverrides: Record<string, boolean> = {},
): UserPermissionsResponse {
  const own = (key: string) =>
    userOverrides[key] ?? roleOverrides[key] ?? holdsByDefault(user.role, key);

  return {
    user: { isActive: true, ...user },
    features: PERMISSION_LIST.map((p) => {
      const roleDefault = holdsByDefault(user.role, p.key);
      const roleEffective = roleOverrides[p.key] ?? roleDefault;
      const userOverride = p.key in userOverrides ? userOverrides[p.key] : null;
      const parentEffective = p.parent === null ? true : own(p.parent);
      return {
        ...meta(p),
        roleDefault,
        roleEffective,
        userOverride,
        effective: (userOverride ?? roleEffective) && parentEffective,
        parentEffective,
        available: isAvailableTo(p, user.role),
        locked: isLocked(user.role, p.key),
      };
    }),
  };
}

/** Screen-level keys only — the rows the matrix shows before anything expands. */
export const FEATURE_COUNT = FEATURE_LIST.length;
/** Every grantable key, screens plus actions plus panels. */
export const PERMISSION_COUNT = PERMISSION_LIST.length;
export const NAV_FEATURE_COUNT = FEATURE_LIST.filter((f) => f.nav).length;
