'use client';

import { Check, ChevronLeft, ChevronRight, Calendar, CalendarRange, CalendarDays, Download, Upload } from 'lucide-react';
import type { Branch } from '@/types';
import { addDays } from '@/lib/manilaDate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ALL = 'all';

/** A branch tab: larger than a chip; the selected one is solid brand colour, not the faint default. */
const BRANCH_TAB =
  'gap-1.5 px-4 font-semibold md:h-10 bg-background border border-transparent text-foreground ' +
  'hover:border-border hover:bg-background hover:text-foreground ' +
  'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-md ' +
  'data-[state=on]:ring-2 data-[state=on]:ring-primary/30 data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground';

interface InventoryFilterBarProps {
  dateMode: 'date' | 'range';
  draftFrom: string;
  draftTo: string;
  filterBranch: string;
  branches: Branch[];
  today: string;
  onDateModeChange: (mode: 'date' | 'range') => void;
  onDraftFromChange: (v: string) => void;
  onDraftToChange: (v: string) => void;
  onCommitDates: (from: string, to: string) => void;
  onStepDate: (delta: number) => void;
  onBranchChange: (branchId: string) => void;
  onImportOpen?: () => void;
  /** Absent without the revenue permission: the workbook carries sales and cash. */
  onExportOpen?: () => void;
}

export default function InventoryFilterBar({
  dateMode,
  draftFrom,
  draftTo,
  filterBranch,
  branches,
  today,
  onDateModeChange,
  onDraftFromChange,
  onDraftToChange,
  onCommitDates,
  onStepDate,
  onBranchChange,
  onImportOpen,
  onExportOpen,
}: InventoryFilterBarProps) {

  return (
    <TooltipProvider>
      {/* Branch tabs: the branch is which paper sheet you are on, so it leads the page.
          The chosen one is filled in the brand colour with a check, readable at a glance. */}
      <div className="mb-3 rounded-lg border bg-muted/40 p-1.5">
        <ToggleGroup
          type="single"
          // "All" is the empty filter, but Radix reads an empty value as "nothing selected",
          // so the tab never looked chosen. It gets its own value here.
          value={filterBranch || ALL}
          onValueChange={(val) => onBranchChange(!val || val === ALL ? '' : val)}
          aria-label="Branch"
          className="flex-wrap gap-1.5 justify-start"
        >
          <ToggleGroupItem value={ALL} className={BRANCH_TAB}>
            {filterBranch === '' && <Check className="h-4 w-4" aria-hidden />}
            All
          </ToggleGroupItem>
          {branches.map((b) => {
            const id = b.id.toString();
            return (
              <ToggleGroupItem key={b.id} value={id} className={BRANCH_TAB}>
                {filterBranch === id && <Check className="h-4 w-4" aria-hidden />}
                {b.name}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Mode toggle */}
        <ToggleGroup type="single" value={dateMode} onValueChange={(val) => { if (val) onDateModeChange(val as 'date' | 'range'); }}>
          <Tooltip><TooltipTrigger asChild>
            <ToggleGroupItem value="date" size="sm"><Calendar className="h-4 w-4" /></ToggleGroupItem>
          </TooltipTrigger><TooltipContent>Single date</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <ToggleGroupItem value="range" size="sm"><CalendarRange className="h-4 w-4" /></ToggleGroupItem>
          </TooltipTrigger><TooltipContent>Date range</TooltipContent></Tooltip>
        </ToggleGroup>

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label="Previous period" onClick={() => onStepDate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Previous period</TooltipContent></Tooltip>

        {dateMode === 'date' ? (
          <Input
            type="date"
            value={draftFrom}
            onChange={(e) => {
              const v = e.target.value;
              onDraftFromChange(v);
              onDraftToChange(v);
              onCommitDates(v, v);
            }}
            className="w-[150px] h-11 md:h-8"
          />
        ) : (
          <>
            <Input
              type="date"
              value={draftFrom}
              onChange={(e) => {
                const v = e.target.value;
                onDraftFromChange(v);
                if (v > draftTo) onDraftToChange(v);
              }}
              onBlur={() => onCommitDates(draftFrom, draftTo)}
              className="w-[150px] h-11 md:h-8"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <Input
              type="date"
              value={draftTo}
              onChange={(e) => {
                const v = e.target.value;
                onDraftToChange(v);
                if (v < draftFrom) onDraftFromChange(v);
              }}
              onBlur={() => onCommitDates(draftFrom, draftTo)}
              className="w-[150px] h-11 md:h-8"
            />
          </>
        )}

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 md:size-8" aria-label="Next period" onClick={() => onStepDate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Next period</TooltipContent></Tooltip>

        {(draftFrom !== today || draftTo !== today) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { onDraftFromChange(today); onDraftToChange(today); onCommitDates(today, today); }}
          >
            <CalendarDays className="h-3.5 w-3.5 mr-1" /> Today
          </Button>
        )}

        {dateMode === 'range' && (
          <>
            <Button size="sm" variant="ghost" onClick={() => {
              // From `today` (Manila) by string arithmetic. A device Date shifted
              // through toISOString() lands on the previous UTC day in Manila.
              const fromStr = addDays(today, -6);
              onDraftFromChange(fromStr); onDraftToChange(today); onCommitDates(fromStr, today);
            }}>Last 7d</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              const fromStr = `${today.slice(0, 7)}-01`;
              onDraftFromChange(fromStr); onDraftToChange(today); onCommitDates(fromStr, today);
            }}>This Month</Button>
          </>
        )}

        <div className="flex-grow" />

        {onExportOpen && (
          <Button size="sm" variant="outline" onClick={onExportOpen}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export XLSX
          </Button>
        )}

        {onImportOpen && (
          <Button size="sm" variant="outline" onClick={onImportOpen}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import XLSX
          </Button>
        )}


      </div>

    </TooltipProvider>
  );
}
