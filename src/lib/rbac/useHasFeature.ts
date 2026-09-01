'use client';

import { useAuth } from '@/contexts/AuthContext';
import type { PermissionKey } from './features';

/**
 * Whether the signed-in account holds a permission.
 *
 * For gating controls *within* a screen, where the action belongs to a
 * different feature than the page itself — the autofill buttons on the
 * inventory gaps page are governed by `jobs`, not by `inventory-history`, so a
 * role that can read the page cannot necessarily run them.
 *
 * Accepts any grantable key, so it also gates action and panel keys:
 * `useCan('products:delete')` hides a delete control, `useCan('dashboard:kpis')`
 * hides a card.
 *
 * Route-level gating does not need this: `RouteGuard` derives it from the
 * manifest. This is only for controls, and it is presentation, not security —
 * the endpoint behind the control enforces the same key. For panels marked
 * `sensitive` the server additionally withholds the data, so hiding here is
 * about layout rather than confidentiality.
 */
export function useHasFeature(key: PermissionKey): boolean {
  const { permissions } = useAuth();
  return permissions.includes(key);
}

/** Reads better than `useHasFeature` at action and panel call sites. */
export const useCan = useHasFeature;
