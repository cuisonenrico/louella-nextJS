'use client';

import { ChevronLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SidebarContent from './SidebarContent';

export const DRAWER_WIDTH = 240;
export const COLLAPSED_WIDTH = 64;

/**
 * The static desktop sidebar: positioning, width and the collapse toggle.
 *
 * Everything navigable lives in `SidebarContent`, which the mobile drawer
 * renders too — one `navigationFor(permissions)` call, two mounts, so the two
 * can never disagree about what a role may reach.
 *
 * The collapse toggle stays here rather than in the shared content: it is a
 * desktop affordance and the drawer must not render it.
 */
export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <aside
      data-testid="sidebar-aside"
      // `hidden md:flex`, not a JS breakpoint: below md the drawer renders this
      // same content, and mounting it only when opened means the nav never
      // exists twice and hydration has nothing to disagree about.
      className="hidden md:flex sticky top-0 h-screen shrink-0 flex-col overflow-hidden border-r-0 text-white transition-all duration-200"
      style={{
        width,
        background: 'linear-gradient(180deg, #33200F 0%, #241407 100%)',
      }}
    >
      <SidebarContent
        collapsed={collapsed}
        action={
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="text-white hover:bg-white/10 h-8 w-8"
          >
            {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        }
      />
    </aside>
  );
}
