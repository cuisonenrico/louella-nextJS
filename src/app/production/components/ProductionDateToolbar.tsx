'use client';

import { ChevronLeft, ChevronRight, CalendarDays, FilePlus, Plus, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  filterDate: string;
  today: string;
  missingProductionCount: number;
  missingInventoryBranchCount: number;
  isProdLoading: boolean;
  isInvLoading: boolean;
  isInitProdPending: boolean;
  isInitAllInvPending: boolean;
  onDateChange: (next: string) => void;
  onInitProduction: () => void;
  onInitAllInventory: () => void;
};

export default function ProductionDateToolbar({
  filterDate,
  today,
  missingProductionCount,
  missingInventoryBranchCount,
  isProdLoading,
  isInvLoading,
  isInitProdPending,
  isInitAllInvPending,
  onDateChange,
  onInitProduction,
  onInitAllInventory,
}: Props) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD'))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Previous day</TooltipContent></Tooltip>

        <Input
          type="date"
          value={filterDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-[150px] h-8"
        />

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(dayjs(filterDate).add(1, 'day').format('YYYY-MM-DD'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Next day</TooltipContent></Tooltip>

        {filterDate !== today && (
          <Button size="sm" variant="outline" onClick={() => onDateChange(today)}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" /> Today
          </Button>
        )}

        {!isProdLoading && missingProductionCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={onInitProduction} disabled={isInitProdPending}>
                {isInitProdPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FilePlus className="h-3.5 w-3.5 mr-1" />}
                Init Production ({missingProductionCount})
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Create production records for {missingProductionCount} product{missingProductionCount !== 1 ? 's' : ''}</TooltipContent>
          </Tooltip>
        )}

        {!isInvLoading && missingInventoryBranchCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="secondary" onClick={onInitAllInventory} disabled={isInitAllInvPending}>
                {isInitAllInvPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Init Inventory ({missingInventoryBranchCount})
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Initialize inventory for {missingInventoryBranchCount} branch{missingInventoryBranchCount !== 1 ? 'es' : ''}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
