'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { usePageHeaderStore } from '@/lib/pageHeaderStore';

/**
 * Publishes a page's header (title, and optional custom content/actions) into
 * the shared store consumed by the persistent shell Header in `(app)/layout`.
 *
 * Replaces the old `<AppLayout title=… headerContent=… headerActions=…>` props.
 *
 * The effect re-runs when any of `title`/`content`/`actions` change, so a page
 * with static strings sets the header once, while a page with stateful controls
 * (e.g. sales) keeps them in sync as it re-renders. The header is not cleared on
 * unmount — the next page's call fully replaces it — so navigation shows the
 * previous title for at most one frame instead of flashing empty.
 */
export function usePageHeader(header: {
  title?: string;
  content?: ReactNode;
  actions?: ReactNode;
}) {
  const { title, content, actions } = header;
  useEffect(() => {
    usePageHeaderStore.getState().setHeader({ title, content, actions });
  }, [title, content, actions]);
}
