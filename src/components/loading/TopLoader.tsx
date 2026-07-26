'use client';

import { useEffect, useRef, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/**
 * A thin top-of-viewport progress bar that reflects any in-flight TanStack
 * Query activity (background refetches and mutations included). It makes
 * otherwise-invisible refetches perceptible without swapping page content for
 * a spinner. Mount once, globally.
 */
export function TopLoader() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const active = isFetching + isMutating > 0;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    if (active) {
      clearTimers();
      setVisible(true);
      // Ease toward ~90% while work is in flight; never reach 100 until done.
      setProgress(10);
      timers.current.push(setTimeout(() => setProgress(60), 150));
      timers.current.push(setTimeout(() => setProgress(80), 500));
      timers.current.push(setTimeout(() => setProgress(90), 1200));
    } else if (visible) {
      // Snap to full, then fade out and reset.
      clearTimers();
      setProgress(100);
      timers.current.push(
        setTimeout(() => setVisible(false), 250),
        setTimeout(() => setProgress(0), 500)
      );
    }

    return clearTimers;
    // `visible` intentionally omitted: it's an output of this effect, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
