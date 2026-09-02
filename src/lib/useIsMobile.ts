'use client';

import { useSyncExternalStore } from 'react';

/**
 * The one shell breakpoint, matching Tailwind's `md`.
 *
 * Exported so the hook and the `md:` utility classes cannot drift apart. The
 * media query is `max-width: 767px` rather than `768px` because Tailwind's
 * `md:` applies at >= 768px — at exactly 768 a `768px` query would be true
 * while `md:` was also active, giving a viewport both the desktop sidebar and
 * the mobile dialog.
 */
export const MOBILE_BREAKPOINT_PX = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Whether the viewport is narrower than the shell breakpoint.
 *
 * Uses `useSyncExternalStore` so the server snapshot is explicitly `false` and
 * React reconciles it on hydration instead of warning about a mismatch.
 *
 * Prefer a `md:` utility class wherever CSS can do the job. Reach for this only
 * when mobile and desktop need genuinely different components — the
 * Dialog/Sheet swap is the one case in this app.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
