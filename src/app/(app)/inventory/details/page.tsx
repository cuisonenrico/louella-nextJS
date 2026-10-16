'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { useCan } from '@/lib/rbac/useHasFeature';
import { useIsMobile } from '@/lib/useIsMobile';
import InventoryDesktop from '../components/InventoryDesktop';
import InventoryCashView from '../components/phone/InventoryCashView';
import InventoryPhone from '../components/phone/InventoryPhone';
import { useInventoryDay } from '../hooks/useInventoryDay';

function InventoryDetails() {
  // `?view=cash` is the phone tab bar's Cash destination: the same branch-day,
  // showing only the cash panel.
  const canSeeCash = useCan('branch-cash');
  const cashView = useSearchParams().get('view') === 'cash' && canSeeCash;
  const isMobile = useIsMobile();
  usePageHeader({ title: cashView ? 'Cash' : isMobile ? 'Count' : 'Inventory Details' });
  const day = useInventoryDay({ requireBranch: cashView || isMobile });
  if (cashView) return <InventoryCashView day={day} />;
  return isMobile ? <InventoryPhone day={day} /> : <InventoryDesktop day={day} />;
}

export default function InventoryDetailsPage() {
  // useSearchParams needs a Suspense boundary so the rest of the route can prerender.
  return (
    <Suspense>
      <InventoryDetails />
    </Suspense>
  );
}
