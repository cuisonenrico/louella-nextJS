'use client';

import { ChevronLeft, ChevronRight, Calendar, CalendarRange, CalendarDays, RotateCcw, Plus, Upload, Loader2 } from 'lucide-react';
import type { Branch } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InventoryFilterBarProps {
  dateMode: 'date' | 'range';
  draftFrom: string;
  draftTo: string;
  filterBranch: string;
  branches: Branch[];
  today: string;
  uninitializedCount: number;
  isBulkCreatePending: boolean;
  isReinitializePending: boolean;
  onDateModeChange: (mode: 'date' | 'range') => void;
  onDraftFromChange: (v: string) => void;
  onDraftToChange: (v: string) => void;
  onCommitDates: (from: string, to: string) => void;
  onStepDate: (delta: number) => void;
  onBranchChange: (branchId: string) => void;
  onImportOpen: () => void;
  onBulkCreate: () => void;
  onReinitialize: () => void;
}

export default function InventoryFilterBar({
  dateMode,
  draftFrom,
  draftTo,
  filterBranch,
  branches,
  today,
  uninitializedCount,
  isBulkCreatePending,
  isReinitializePending,
  onDateModeChange,
  onDraftFromChange,
  onDraftToChange,
  onCommitDates,
  onStepDate,
  onBranchChange,
  onImportOpen,
  onBulkCreate,
  onReinitialize,
}: InventoryFilterBarProps) {
  const isRange = draftFrom !== draftTo;

  return (
    <TooltipProvider>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStepDate(-1)}>
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
            className="w-[150px] h-8"
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
              className="w-[150px] h-8"
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
              className="w-[150px] h-8"
            />
          </>
        )}

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStepDate(1)}>
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
              const from = new Date(); from.setDate(from.getDate() - 6);
              const fromStr = from.toISOString().slice(0, 10);
              onDraftFromChange(fromStr); onDraftToChange(today); onCommitDates(fromStr, today);
            }}>Last 7d</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              const now = new Date();
              const fromStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
              onDraftFromChange(fromStr); onDraftToChange(today); onCommitDates(fromStr, today);
            }}>This Month</Button>
          </>
        )}

        <div className="flex-grow" />

        <Button size="sm" variant="outline" onClick={onImportOpen}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Import XLSX
        </Button>

        {!isRange && filterBranch !== '' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-700" onClick={onReinitialize} disabled={isReinitializePending}>
                {isReinitializePending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                Reinitialize
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Reset all entries for this day using yesterday&apos;s leftover as opening quantity.</TooltipContent>
          </Tooltip>
        )}

        {!isRange && uninitializedCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={onBulkCreate} disabled={isBulkCreatePending}>
                {isBulkCreatePending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Sync {uninitializedCount} Product{uninitializedCount !== 1 ? 's' : ''}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{uninitializedCount} active product{uninitializedCount !== 1 ? 's' : ''} missing entries. Click to create them.</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Branch selector */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-1">BRANCH</p>
        <ToggleGroup type="single" value={filterBranch} onValueChange={(val) => onBranchChange(val ?? '')} className="flex-wrap gap-1 justify-start">
          <ToggleGroupItem value="" size="sm">All</ToggleGroupItem>
          {branches.map((b) => (
            <ToggleGroupItem key={b.id} value={b.id.toString()} size="sm">{b.name}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </TooltipProvider>
  );
}
