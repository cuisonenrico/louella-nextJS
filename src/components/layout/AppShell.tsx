'use client';

import { useState } from 'react';
import RouteGuard from '@/components/layout/RouteGuard';
import Sidebar from '@/components/layout/Sidebar';
import SidebarContent from '@/components/layout/SidebarContent';
import Header from '@/components/layout/Header';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * The authenticated shell: an ordinary flex row.
 *
 * It replaces a pixel contract in which `Sidebar` was `fixed`, `Header`
 * computed `left`/`width` from the sidebar's pixel width and `main` set a
 * matching `marginLeft`. That contract had no way to express "no sidebar",
 * which is why nothing below `md` could work.
 *
 * There is deliberately no `useIsMobile` here. The aside is `hidden md:flex`
 * and the drawer's content only mounts when the Sheet opens, so the nav never
 * exists twice and there is nothing for the server and client to disagree
 * about on hydration. JS breakpoint detection is reserved for the Dialog/Sheet
 * swap, where the two really are different components.
 *
 * Collapse state persists; drawer state does not — a drawer should never be
 * open on arrival.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleToggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />

      {/* The same SidebarContent the aside renders — one navigationFor() call,
          two mounts, so the drawer can never offer a destination the sidebar
          withholds. Content mounts only while open (Radix portals on open). */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="flex w-[280px] flex-col gap-0 border-r-0 p-0 text-white [background:linear-gradient(180deg,#33200F_0%,#241407_100%)]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* `min-w-0` is load-bearing: without it a flex child refuses to shrink
          below its content's intrinsic width, so one wide table pushes the
          whole page into horizontal scroll. */}
      <div data-testid="content-column" className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setDrawerOpen(true)} />
        <main className="flex-1 bg-background p-4 md:p-6">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
