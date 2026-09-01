'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessPath, firstPermittedRoute } from '@/lib/rbac/features';

/**
 * Blocks direct navigation to routes the user's permissions do not cover.
 *
 * The rules are not written here — they come from the shared RBAC manifest, the
 * same source the sidebar renders from, so the two cannot disagree. They
 * previously did: `/settings` was ADMIN-gated here while the sidebar showed
 * Jobs to managers, who were bounced the moment they clicked it.
 *
 * Denial sends the user to their own first permitted destination rather than a
 * hardcoded `/dashboard`. Hardcoding it meant any role without the `dashboard`
 * permission was redirected into a route it was itself denied, and then
 * redirected again, rendering nothing forever.
 *
 * This is navigation UX layered on top of the real boundary — the API enforces
 * the same permissions via `@RequireFeature`, so bypassing this changes what is
 * drawn, not what is readable.
 */
export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated, permissions } = useAuth();

  const allowed = canAccessPath(pathname, permissions);

  useEffect(() => {
    if (isLoading || !isAuthenticated || allowed) return;
    router.replace(firstPermittedRoute(permissions));
  }, [pathname, isLoading, isAuthenticated, allowed, permissions, router]);

  if (isLoading) return null;
  if (isAuthenticated && !allowed) return null;

  return <>{children}</>;
}
