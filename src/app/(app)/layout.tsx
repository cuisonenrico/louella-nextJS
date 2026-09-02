import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/layout/AppShell';

/**
 * Shell for all authenticated routes. Rendered once by the `(app)` route group
 * and persists across client-side navigation — the sidebar and header never
 * remount; only `children` (the page content) swaps and shows its own loading.
 *
 * The layout itself lives in `AppShell` so it can be rendered in a test without
 * Next's layout machinery. Pages publish their header via `usePageHeader`; the
 * Header reads it from the shared store, so nothing here takes per-page props.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
