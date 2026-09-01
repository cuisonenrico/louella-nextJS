import { enforceParentRule, ROLE_DEFAULTS, type RoleName } from '@/lib/rbac/features';

export type PermissionOverride = { k: string; e: boolean };

/**
 * Collapse the three layers of permission state into the effective key set.
 *
 * Precedence, lowest to highest:
 *   1. `ROLE_DEFAULTS` — the baseline in code
 *   2. `RoleFeaturePermission` — an admin's per-role override
 *   3. `UserFeaturePermission` — an admin's override for one account
 *
 * A layer may both grant and revoke, so an override with `enabled: false`
 * removes a key an earlier layer granted.
 *
 * Child keys (`products:delete`) are dropped when their parent feature is not
 * held, so a stale override cannot leave someone holding a delete grant for a
 * screen they cannot reach. This is the single place that rule is applied.
 *
 * Kept as a free function so it can be unit-tested without a database and
 * reused by both JwtStrategy (hot path) and PermissionsService (admin matrix).
 */
export function resolvePermissions(
  role: RoleName,
  roleOverrides: readonly PermissionOverride[],
  userOverrides: readonly PermissionOverride[],
): string[] {
  const effective = new Set<string>(ROLE_DEFAULTS[role] ?? []);

  for (const { k, e } of roleOverrides) {
    if (e) effective.add(k);
    else effective.delete(k);
  }
  for (const { k, e } of userOverrides) {
    if (e) effective.add(k);
    else effective.delete(k);
  }

  return enforceParentRule(Array.from(effective));
}
