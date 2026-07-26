import { create } from 'zustand';
import type { ReactNode } from 'react';

/**
 * Holds the content of the persistent app-shell Header. The Header lives in
 * `(app)/layout.tsx` (mounted once), so each page publishes its title — and,
 * where needed, custom header controls/actions — into this store via
 * `usePageHeader`. `setHeader` fully replaces the header, so a page that omits
 * `content`/`actions` implicitly clears the previous page's.
 */
type PageHeader = {
  title: string;
  content: ReactNode | null;
  actions: ReactNode | null;
};

type PageHeaderStore = PageHeader & {
  setHeader: (h: { title?: string; content?: ReactNode; actions?: ReactNode }) => void;
};

const EMPTY: PageHeader = { title: '', content: null, actions: null };

export const usePageHeaderStore = create<PageHeaderStore>((set) => ({
  ...EMPTY,
  setHeader: (h) =>
    set({
      title: h.title ?? '',
      content: h.content ?? null,
      actions: h.actions ?? null,
    }),
}));
