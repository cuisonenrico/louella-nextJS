'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/useIsMobile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

/**
 * A modal that is a centred Dialog on desktop and a bottom sheet on mobile.
 *
 * This is the one place JS breakpoint detection is warranted: the two are
 * different components with different animations and focus behaviour, so no
 * amount of CSS turns one into the other. Everywhere else in this app, use a
 * `md:` utility class.
 *
 * Built on `ui/sheet.tsx`'s `bottom` variant rather than vaul — same Radix
 * Dialog primitive underneath, same accessibility model, no new runtime
 * dependency. The trade is no drag-to-dismiss.
 *
 * The API mirrors `Dialog*` exactly, so converting a call site is an import
 * swap plus a rename.
 */

type Props = React.ComponentProps<typeof Dialog>;

export function ResponsiveDialog(props: Props) {
  const isMobile = useIsMobile();
  const Root = isMobile ? Sheet : Dialog;
  return <Root {...props} />;
}

export function ResponsiveDialogTrigger(
  props: React.ComponentProps<typeof DialogTrigger>
) {
  const isMobile = useIsMobile();
  const Trigger = isMobile ? SheetTrigger : DialogTrigger;
  return <Trigger {...props} />;
}

export function ResponsiveDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      // `dvh` for the same reason DialogContent uses it: `vh` is the large
      // viewport, so an 85vh sheet is taller than the screen while browser
      // chrome is showing. `pb-safe` clears the home indicator, which needs
      // the viewport-fit=cover declared in src/app/layout.tsx.
      <SheetContent
        side="bottom"
        className={cn(
          'flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-xl pb-safe',
          className
        )}
        {...props}
      >
        {children}
      </SheetContent>
    );
  }

  return (
    <DialogContent className={className} {...props}>
      {children}
    </DialogContent>
  );
}

export function ResponsiveDialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  const Header = isMobile ? SheetHeader : DialogHeader;
  return <Header {...props} />;
}

/**
 * Required, not optional: both primitives derive their accessible name from it.
 * Pass `className="sr-only"` when it should not be visible.
 */
export function ResponsiveDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile();
  const Title = isMobile ? SheetTitle : DialogTitle;
  return <Title {...props} />;
}

export function ResponsiveDialogDescription(
  props: React.ComponentProps<typeof DialogDescription>
) {
  const isMobile = useIsMobile();
  const Description = isMobile ? SheetDescription : DialogDescription;
  return <Description {...props} />;
}

export function ResponsiveDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  const Footer = isMobile ? SheetFooter : DialogFooter;
  return (
    <Footer
      data-testid="responsive-dialog-footer"
      // `flex-col-reverse` on mobile puts the primary action under the thumb
      // by flipping the visual order only — the DOM order, and so the tab
      // order, still follows the source.
      className={cn(isMobile && 'flex flex-col-reverse gap-2', className)}
      {...props}
    />
  );
}
