'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { featureForPath, navigationFor, type NavGroup } from '@/lib/rbac/features';
import { DEFAULT_NAV_ICON, NAV_ICONS } from './navIcons';

/**
 * Groups that render with their own heading and icon rather than a plain
 * separator, preserving the previous visual treatment of Config and Settings.
 */
const DECORATED_GROUPS: Partial<Record<NavGroup, { icon: typeof Settings }>> = {
  Config: { icon: Settings },
  Settings: { icon: ShieldCheck },
};

/**
 * The brand block and navigation, with no positioning of its own.
 *
 * Extracted from `Sidebar` so the mobile drawer can render the *same* nav
 * rather than a second copy. That matters beyond tidiness: the item list comes
 * from `navigationFor(permissions)`, and a second source could drift and offer
 * a manager a link `RouteGuard` then bounces them off. One source, two mounts.
 *
 * @param action  Rendered at the end of the brand row. The static sidebar puts
 *                its collapse toggle here; the drawer passes nothing, because
 *                collapsing is a desktop affordance.
 * @param onNavigate  Fires after a nav item is clicked, so the drawer can close
 *                    itself. The static sidebar passes nothing.
 */
export default function SidebarContent({
  collapsed,
  onNavigate,
  action,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = useAuth();

  // Derived entirely from the shared RBAC manifest and the user's effective
  // permissions. The sidebar deliberately knows nothing about roles: role is
  // resolved into permissions server-side, so there is exactly one place where
  // "who may see what" is decided.
  const groups = navigationFor(permissions);

  // Which feature owns the current URL. Resolving this once, by longest prefix,
  // is what keeps exactly one item highlighted: /production/orders belongs to
  // `production-orders`, not to `production`, even though both prefixes match.
  const activeKey = featureForPath(pathname)?.key ?? null;

  function renderItem(item: { key: string; href: string; label: string }) {
    const active = item.key === activeKey;
    const Icon = NAV_ICONS[item.key] ?? DEFAULT_NAV_ICON;

    const btn = (
      <li key={item.href}>
        <button
          onClick={() => {
            router.push(item.href);
            onNavigate?.();
          }}
          className={cn(
            'flex w-full items-center rounded-lg text-sm transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3',
            active
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              active ? 'text-primary-foreground' : 'text-white/60'
            )}
          />
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

  return (
    <>
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
              <h1 className="font-display text-xl font-semibold italic leading-tight text-white">Louella</h1>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">Panaderya</span>
            </div>
          </div>
        )}
        {action}
      </div>

      <Separator className="bg-white/15 mx-2" />

      {/* Nav */}
      <nav
        aria-label="Main"
        className={cn('flex-1 overflow-y-auto pb-2', collapsed ? 'px-1 mt-2' : 'px-2 mt-1')}
      >
        {groups.map(({ group, items }, gi) => {
          const decoration = DECORATED_GROUPS[group];
          const GroupIcon = decoration?.icon;
          return (
            <div key={group} className={gi > 0 ? 'mt-1' : undefined}>
              {gi > 0 &&
                (collapsed ? (
                  <Separator className="bg-white/15 mx-1 my-1.5" />
                ) : (
                  <div className="mt-3 mb-1 px-2 flex items-center gap-1.5">
                    {GroupIcon && <GroupIcon className="h-3 w-3 text-white/50" />}
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                      {group}
                    </span>
                    <div className="flex-1 h-px bg-white/15" />
                  </div>
                ))}
              <ul className="space-y-0.5">{items.map(renderItem)}</ul>
            </div>
          );
        })}
      </nav>
    </>
  );
}
