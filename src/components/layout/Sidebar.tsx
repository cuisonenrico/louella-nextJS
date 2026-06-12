'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Store, Package, Layers, BookOpen, TrendingUp,
  Warehouse, FlaskConical, Factory, ChevronLeft, Menu, ClipboardList, Settings, Upload,
  Users, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export const DRAWER_WIDTH = 240;
export const COLLAPSED_WIDTH = 64;

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  activePrefix?: string;
  featureKey?: string;
  minRole?: string;
};

const ROLE_ORDER: Record<string, number> = {
  USER: 0, VIEWER: 1, INVENTORY: 2, MANAGER: 3, ADMIN: 4,
};

function canSee(item: NavItem, permissions: string[], role: string): boolean {
  if (item.featureKey) return permissions.includes(item.featureKey);
  if (item.minRole) return (ROLE_ORDER[role] ?? -1) >= (ROLE_ORDER[item.minRole] ?? Infinity);
  return true;
}

const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, featureKey: 'dashboard' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Revenue', href: '/sales', icon: TrendingUp, featureKey: 'analytics' },
      { label: 'Inventory', href: '/inventory/details', icon: Package, featureKey: 'inventory-history', activePrefix: '/inventory' },
      { label: 'Production', href: '/production', icon: Factory, exact: true, minRole: 'MANAGER' },
      { label: 'Prod. Orders', href: '/production/orders', icon: ClipboardList, minRole: 'MANAGER' },
      { label: 'Import History', href: '/inventory-import/history', icon: Upload, minRole: 'MANAGER' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { label: 'Material Stock', href: '/material-inventory', icon: Warehouse, minRole: 'MANAGER' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', href: '/products', icon: Layers, minRole: 'MANAGER' },
      { label: 'Materials', href: '/materials', icon: FlaskConical, minRole: 'MANAGER' },
      { label: 'Recipes', href: '/recipes', icon: BookOpen, minRole: 'MANAGER' },
      { label: 'Branches', href: '/branches', icon: Store, minRole: 'MANAGER' },
    ],
  },
];

const configNavItems: NavItem[] = [
  { label: 'Product Order', href: '/config/product-order', icon: Layers, minRole: 'ADMIN' },
];

const settingsNavItems: NavItem[] = [
  { label: 'Users', href: '/settings/users', icon: Users },
  { label: 'Permissions', href: '/settings/permissions', icon: ShieldCheck },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, permissions } = useAuth();
  const role = user?.role ?? '';
  const isAdmin = role === 'ADMIN';
  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  function renderItem(item: NavItem) {
    const matchBase = item.activePrefix ?? item.href;
    const active = pathname === item.href
      || (!item.exact && pathname === matchBase)
      || (!item.exact && pathname.startsWith(matchBase + '/'));
    const Icon = item.icon;
    const btn = (
      <li key={item.href}>
        <button
          onClick={() => router.push(item.href)}
          className={cn(
            'flex w-full items-center rounded-lg text-sm transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3',
            active
              ? 'bg-white/20 text-white font-bold'
              : 'text-white/75 hover:bg-white/10 hover:text-white'
          )}
        >
          <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-white/70')} />
          {!collapsed && <span>{item.label}</span>}
        </button>
      </li>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.href} delayDuration={0}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  }

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSee(item, permissions, role)),
    }))
    .filter((group) => group.items.length > 0);

  const visibleConfig = configNavItems.filter((item) => canSee(item, permissions, role));

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r-0 text-white transition-all duration-200"
      style={{
        width,
        background: 'linear-gradient(180deg, #c25500 0%, #FA8128 100%)',
      }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center pt-4 pb-2 min-h-[56px]',
          collapsed ? 'justify-center px-0' : 'justify-between px-4'
        )}
      >
        {collapsed ? (
          <div className="bg-white rounded-md p-0.5 flex">
            <Image src="/favicon.png" alt="Louella" width={28} height={28} style={{ objectFit: 'contain' }} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="bg-white rounded-md p-0.5 flex">
              <Image src="/favicon.png" alt="Louella" width={32} height={32} style={{ objectFit: 'contain' }} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight text-white">Louella</h1>
              <span className="text-xs text-white/70">Bakery Management</span>
            </div>
          </div>
        )}
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
      </div>

      <Separator className="bg-white/15 mx-2" />

      {/* Nav Items */}
      <nav className={cn('flex-1 overflow-y-auto pb-2', collapsed ? 'px-1 mt-2' : 'px-2 mt-1')}>
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              collapsed
                ? <Separator className="bg-white/15 mx-1 my-1.5" />
                : (
                  <div className="mt-3 mb-1 px-2 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-white/15" />
                  </div>
                )
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => renderItem(item))}
            </ul>
          </div>
        ))}

        {/* Config section */}
        {visibleConfig.length > 0 && (
          <div className="mt-1">
            {collapsed
              ? <Separator className="bg-white/15 mx-1 my-1.5" />
              : (
                <div className="mt-3 mb-1 px-2 flex items-center gap-1.5">
                  <Settings className="h-3 w-3 text-white/50" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Config</span>
                  <div className="flex-1 h-px bg-white/15" />
                </div>
              )
            }
            <ul className="space-y-0.5">
              {visibleConfig.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                const btn = (
                  <li key={item.href}>
                    <button
                      onClick={() => router.push(item.href)}
                      className={cn(
                        'flex w-full items-center rounded-lg text-sm transition-colors',
                        collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3',
                        active
                          ? 'bg-white/20 text-white font-bold'
                          : 'text-white/75 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-white/70')} />
                      {!collapsed && <span>{item.label}</span>}
                    </button>
                  </li>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.href} delayDuration={0}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent side="right">Config: {item.label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return btn;
              })}
            </ul>
          </div>
        )}

        {/* Settings section (Admin only) */}
        {isAdmin && (
          <div className="mt-1">
            {collapsed
              ? <Separator className="bg-white/15 mx-1 my-1.5" />
              : (
                <div className="mt-3 mb-1 px-2 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-white/50" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Settings</span>
                  <div className="flex-1 h-px bg-white/15" />
                </div>
              )
            }
            <ul className="space-y-0.5">
              {settingsNavItems.map((item) => renderItem(item))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  );
}
