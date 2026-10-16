'use client';

import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface ProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
}

/** The bottom sheet a phone opens on one product: title, body, a thumb-height footer. */
export function ProductSheet({ open, onOpenChange, title, subtitle, children, footer }: ProductSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl p-0">
        {/* pr-14 keeps the corner text clear of the sheet's close button. */}
        <SheetHeader className="flex-row items-baseline justify-between gap-2 px-4 pb-2 pr-14 pt-4 text-left">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {subtitle ? (
            <SheetDescription className="shrink-0 text-xs">{subtitle}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-3">{children}</div>
        <SheetFooter className="flex-row gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
