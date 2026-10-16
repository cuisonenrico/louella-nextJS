'use client';

import BranchCashPanel from '@/components/branch-cash/BranchCashPanel';
import type { InventoryDay } from '../../hooks/useInventoryDay';
import PhoneDayBar from './PhoneDayBar';

/** The phone's Cash tab: the existing branch-cash panel for one branch and day, unchanged. */
export default function InventoryCashView({ day }: { day: InventoryDay }) {
  return (
    <>
      <PhoneDayBar day={day} />
      {day.selectedBranchId != null ? (
        <BranchCashPanel branchId={day.selectedBranchId} date={day.filterDateFrom} />
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">No branch to show.</p>
      )}
    </>
  );
}
