'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import RouteGuard from '@/components/layout/RouteGuard';
import Sidebar, { COLLAPSED_WIDTH, DRAWER_WIDTH } from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

/**
 * Shell for all authenticated routes. Rendered once by the `(app)` route group
 * and persists across client-side navigation — the sidebar and header never
 * remount; only `children` (the page content) swaps and shows its own loading.
 *
 * Pages publish their header via `usePageHeader`; the Header reads it from the
 * shared store, so this layout takes no per-page props.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  const handleToggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
        <Header sidebarWidth={sidebarWidth} />
        <main
          className="flex-1 p-6 bg-background min-h-screen pt-20 transition-all duration-200"
          style={{ marginLeft: sidebarWidth }}
        >
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </AuthGuard>
  );
}
