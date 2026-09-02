'use client';

import { useState } from 'react';
import { Monitor, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Says plainly that bulk grid entry is a desktop task, instead of leaving
 * someone to discover it by fighting a twelve-column sheet on a phone.
 *
 * The grids keep their 32px cells deliberately — sizing them for touch would
 * halve the rows visible on the desktop screens they are built for, to serve a
 * phone workflow this app does not ship. This notice is what makes that an
 * honest position rather than a silent one.
 *
 * `md:hidden` rather than `useIsMobile`: nothing here differs structurally
 * between the two, only whether it is shown.
 *
 * **Render this inside the screen's permission-gated body.** Above the gate, a
 * user who cannot open the screen would still be told how to use it.
 */
export default function SmallScreenNotice({
  storageKey,
  children,
}: {
  storageKey: string;
  children?: React.ReactNode;
}) {
  const key = `small-screen-notice:${storageKey}`;

  const [dismissed, setDismissed] = useState(() => {
    // Never throw on a storage read: private mode and blocked site data both
    // make this inaccessible, and a notice is not worth breaking a screen over.
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key, 'true');
    } catch {
      /* Dismissal simply will not persist. */
    }
    setDismissed(true);
  };

  return (
    <Alert className="mb-4 flex items-start gap-3 md:hidden">
      <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <AlertDescription className="flex-1">
        {children ?? 'This sheet is built for a wider screen. You can read and scroll it here — swipe sideways for the other columns — but entering a day of figures is much easier on a desktop.'}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="-mr-2 -mt-2 size-11 shrink-0"
        aria-label="Dismiss notice"
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </Alert>
  );
}
