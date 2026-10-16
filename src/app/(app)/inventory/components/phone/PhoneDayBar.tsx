'use client';

import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { manilaToday } from '@/lib/manilaDate';
import { useCan } from '@/lib/rbac/useHasFeature';
import type { InventoryDay } from '../../hooks/useInventoryDay';

/**
 * One day, one branch: ‹ previous · Today · next ›, plus a branch picker for
 * accounts that see every branch. A branch-scoped manager has nothing to pick.
 */
export default function PhoneDayBar({ day, aside }: { day: InventoryDay; aside?: ReactNode }) {
  const seesAllBranches = useCan('all-branches');
  const today = manilaToday();
  const date = day.filterDateFrom;
  const label = date === today ? 'Today' : dayjs(date).format('ddd, MMM D');

  const goToday = () => {
    day.setDraftFrom(today);
    day.setDraftTo(today);
    day.commitDates(today, today);
  };

  return (
    <div className="-mx-4 -mt-4 mb-3 flex flex-col gap-2 border-b bg-background px-2 py-2">
      {seesAllBranches && day.branches.length > 1 ? (
        <Select value={day.filterBranch} onValueChange={day.changeBranch}>
          <SelectTrigger className="h-11 w-full" aria-label="Branch">
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {day.branches
                .filter((b) => b.isActive)
                .map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-11" aria-label="Previous day" onClick={() => day.stepDate(-1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" className="h-11 flex-1 font-semibold" onClick={goToday} disabled={date === today}>
          {label}
        </Button>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Next day" onClick={() => day.stepDate(1)}>
          <ChevronRight />
        </Button>
        {aside}
      </div>
    </div>
  );
}
