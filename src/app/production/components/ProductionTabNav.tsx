'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Factory, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProductionTabNav() {
  const pathname = usePathname();
  const isBoard = pathname === '/production';
  const isOrders = pathname === '/production/orders' || pathname.startsWith('/production/orders/');

  const tabs = [
    { label: 'Production Board', href: '/production', icon: Factory, active: isBoard },
    { label: 'Branch Orders', href: '/production/orders', icon: ClipboardList, active: isOrders },
  ];

  return (
    <div className="flex items-center border-b mb-4">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab.active
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
          )}
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
