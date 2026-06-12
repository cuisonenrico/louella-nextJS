'use client';

import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  filterDate: string;
  today: string;
  isInvLoading: boolean;
  isInitAllInvPending: boolean;
  onDateChange: (next: string) => void;
};

export default function ProductionDateToolbar({
  filterDate,
  today,
  isInvLoading,
  isInitAllInvPending,
  onDateChange,
}: Props) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous day" onClick={() => onDateChange(dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD'))}>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next day" onClick={() => onDateChange(dayjs(filterDate).add(1, 'day').format('YYYY-MM-DD'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Next day</TooltipContent></Tooltip>

        {filterDate !== today && (
          <Button size="sm" variant="outline" onClick={() => onDateChange(today)}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" /> Today
          </Button>
        )}

        {(isInvLoading || isInitAllInvPending) && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isInitAllInvPending ? 'Initializing inventory…' : 'Loading…'}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
