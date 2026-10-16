'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { QueueEntry } from '@/lib/mobile/countQueue';

interface SyncChipProps {
  waiting: number;
  failed: QueueEntry[];
  persistent: boolean;
  onEdit: (inventoryId: number) => void;
  onDiscard: (inventoryId: number) => void;
  productName: (inventoryId: number) => string;
}

/** Whether the counts typed on this phone have reached the server. */
export function SyncChip({ waiting, failed, persistent, onEdit, onDiscard, productName }: SyncChipProps) {
  const [open, setOpen] = useState(false);
  const memoryOnly = !persistent && (waiting > 0 || failed.length > 0) && (
    <span className="text-xs text-muted-foreground">Kept only until this page closes</span>
  );

  return (
    <div role="status" className="flex flex-wrap items-center justify-end gap-1">
      {failed.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="destructive" size="sm" className="h-11 rounded-full px-3 text-xs">
              {failed.length} couldn&apos;t save
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-72 flex-col gap-3">
            {failed.map((e) => (
              <div key={e.inventoryId} className="flex flex-col gap-2">
                <p className="text-sm">
                  {productName(e.inventoryId)}: {e.error}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setOpen(false); onEdit(e.inventoryId); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setOpen(false); onDiscard(e.inventoryId); }}>
                    Discard
                  </Button>
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
      {waiting > 0 ? (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
          ● {waiting} waiting for signal
        </Badge>
      ) : failed.length === 0 ? (
        <Badge variant="secondary">● Saved</Badge>
      ) : null}
      {memoryOnly}
    </div>
  );
}
