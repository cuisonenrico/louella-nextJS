'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, LayoutGrid, Menu, Wallet, type LucideIcon } from 'lucide-react';
import { inventoryAdjustmentsApi } from '@/lib/apiServices';
import { useCan } from '@/lib/rbac/useHasFeature';
import { cn } from '@/lib/utils';
import { PENDING_TRANSFERS_KEY } from '@/app/(app)/inventory/components/PendingTransfersPanel';

type Tab = { label: string; href: string; icon: LucideIcon; active: boolean; show: boolean; badge?: number };

const TAB = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium';

/**
 * The branch manager's thumb-reach navigation on a phone: the daily count, the
 * morning order, the cash drawer, and "More" for the full sidebar.
 *
 * `md:hidden`, like the drawer button in `Header`: it never exists on a
 * desktop, so there is nothing for server and client to disagree about.
 * Showing a tab is navigation UX only; the route guard and the API enforce access.
 */
export function PhoneTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const view = useSearchParams().get('view');
  const canCount = useCan('inventory-history');
  const canOrders = useCan('production-orders');
  const canCash = useCan('branch-cash');
  const canSeeTransfers = useCan('inventory-adjustments');

  const { data: pending = [] } = useQuery({
    queryKey: [...PENDING_TRANSFERS_KEY, 'all'],
    queryFn: () => inventoryAdjustmentsApi.pendingTransfers().then((r) => r.data),
    enabled: canSeeTransfers,
  });
  const incoming = pending.filter((t) => t.direction === 'incoming' && t.canRespond).length;

  const onSheet = pathname === '/inventory/details';
  const tabs: Tab[] = [
    { label: 'Count', href: '/inventory/details', icon: LayoutGrid, active: onSheet && view !== 'cash', show: canCount, badge: incoming },
    {
      label: 'Orders',
      href: '/production/orders',
      icon: ClipboardList,
      active: pathname === '/production/orders' || pathname === '/production-orders',
      show: canOrders,
    },
    { label: 'Cash', href: '/inventory/details?view=cash', icon: Wallet, active: onSheet && view === 'cash', show: canCash },
  ];

  return (
    <nav
      aria-label="Phone navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      {tabs
        .filter((t) => t.show)
        .map(({ label, href, icon: Icon, active, badge }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(TAB, active ? 'text-primary' : 'text-muted-foreground')}
          >
            <span className="relative">
              <Icon className="size-5" />
              {badge ? (
                <span
                  aria-label={`${badge} transfer${badge === 1 ? '' : 's'} waiting`}
                  className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white"
                >
                  {badge}
                </span>
              ) : null}
            </span>
            {label}
          </Link>
        ))}
      <button type="button" onClick={onOpenMore} className={cn(TAB, 'text-muted-foreground')}>
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}
