import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@/lib/rbac/features';

export const FEATURE_KEY = 'required-features';

/**
 * Restrict a controller or handler to holders of a feature permission.
 *
 * Complements `@Roles()` rather than replacing it: `@RequireFeature('products')`
 * says who may reach the resource at all, while `@Roles(UserRole.MANAGER)`
 * continues to say who may modify it.
 *
 * Accepts any grantable key: a feature (`'products'`), an action
 * (`'products:delete'`) or a panel (`'dashboard:revenue-trend'`).
 *
 * Passing several keys means ANY of them suffices, for endpoints that serve
 * more than one screen. The `PermissionKey` union is what turns a typo into a
 * compile error instead of an endpoint nobody can ever reach.
 */
export const RequireFeature = (...features: PermissionKey[]) =>
  SetMetadata(FEATURE_KEY, features);
