'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

type RouteRule =
  | { type: 'permission'; key: string }
  | { type: 'minRole'; role: string };

const ROLE_ORDER: Record<string, number> = {
  USER: 0, VIEWER: 1, INVENTORY: 2, MANAGER: 3, ADMIN: 4,
};

const ROUTE_RULES: Array<{ prefix: string; rule: RouteRule }> = [
  { prefix: '/dashboard', rule: { type: 'permission', key: 'dashboard' } },
  { prefix: '/sales', rule: { type: 'permission', key: 'analytics' } },
  { prefix: '/inventory', rule: { type: 'permission', key: 'inventory-history' } },
  { prefix: '/inventory-adjustments', rule: { type: 'minRole', role: 'INVENTORY' } },
  { prefix: '/production', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/production-orders', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/production-cost', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/production-efficiency', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/material-inventory', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/products', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/materials', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/recipes', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/branches', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/suppliers', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/inventory-import', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/unit-conversions', rule: { type: 'minRole', role: 'MANAGER' } },
  { prefix: '/config', rule: { type: 'minRole', role: 'ADMIN' } },
  { prefix: '/settings', rule: { type: 'minRole', role: 'ADMIN' } },
];

function canAccess(rule: RouteRule, permissions: string[], role: string): boolean {
  if (rule.type === 'permission') return permissions.includes(rule.key);
  return (ROLE_ORDER[role] ?? -1) >= (ROLE_ORDER[rule.role] ?? Infinity);
}

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated, permissions, user } = useAuth();
  const role = user?.role ?? '';

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const matched = ROUTE_RULES.find(
      ({ prefix }) => pathname === prefix || pathname.startsWith(prefix + '/'),
    );

    if (matched && !canAccess(matched.rule, permissions, role)) {
      router.replace('/dashboard');
    }
  }, [pathname, isLoading, isAuthenticated, permissions, role, router]);

  if (isLoading) return null;

  if (isAuthenticated) {
    const matched = ROUTE_RULES.find(
      ({ prefix }) => pathname === prefix || pathname.startsWith(prefix + '/'),
    );
    if (matched && !canAccess(matched.rule, permissions, role)) {
      return null;
    }
  }

  return <>{children}</>;
}
