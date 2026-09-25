'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setNavigationBlocker } from '@/lib/navigationGuard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PendingAction {
  proceed: () => void;
  cancel?: () => void;
}

/**
 * Asks "discard unsaved changes?" before leaving a sheet with pending edits.
 *
 * While `dirty` it covers:
 * - app navigation through `guardNavigation` (sidebar, logout),
 * - clicks on in-app `<a>` links (`next/link`),
 * - reload / tab close / external links, via the browser's own prompt,
 * - in-page actions that would drop the edits, through `confirmDiscard`.
 *
 * Render the returned `dialog` somewhere in the page.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [pending, setPendingState] = useState<PendingAction | null>(null);
  // Radix fires onOpenChange(false) after the Discard click too; the ref lets
  // that handler see the action was already taken and skip `cancel`.
  const pendingRef = useRef<PendingAction | null>(null);
  const setPending = useCallback((next: PendingAction | null) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  /** Runs `proceed` now if nothing is pending, otherwise asks first. */
  const confirmDiscard = useCallback((proceed: () => void, cancel?: () => void) => {
    if (dirtyRef.current) setPending({ proceed, cancel });
    else proceed();
  }, [setPending]);

  useEffect(() => {
    if (!dirty) return;
    const blocker = (proceed: () => void) => setPending({ proceed });
    setNavigationBlocker(blocker);
    return () => setNavigationBlocker(null);
  }, [dirty, setPending]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Capture phase on `document` runs before React's root listener, so stopping
  // the event here keeps `next/link` from starting its own navigation.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      // Other sites unload the page, so `beforeunload` already asks.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ proceed: () => router.push(url.pathname + url.search + url.hash) });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, router, setPending]);

  const dialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (open) return;
        pendingRef.current?.cancel?.();
        setPending(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have edits on this sheet that haven&apos;t been saved. If you leave now, they will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const action = pendingRef.current;
              setPending(null);
              action?.proceed();
            }}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmDiscard, dialog };
}
