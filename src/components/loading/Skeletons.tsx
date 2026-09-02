import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Reusable loading placeholders that mirror the real page layouts, so the
 * transition from loading → loaded doesn't shift the layout or flash a bare
 * centered spinner. Prefer these over `<Loader2 className="animate-spin" />`
 * for first-load of a page's main content.
 */

/** A block of table-like rows. Matches a typical data table body. */
export function TableSkeleton({
  rows = 8,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      role="status"
      aria-label="Loading"
    >
      {/* Header row */}
      <div className="flex gap-3 border-b pb-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-1">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton rows for use *inside* an existing `<TableBody>`. Returns a fragment
 * of `<TableRow>`s so a loading table keeps its columns and height instead of
 * collapsing to a single centered spinner cell.
 */
export function TableRowsSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** A responsive grid of card placeholders (KPI tiles, metric cards). */
export function CardGridSkeleton({
  count = 4,
  height = 'h-28',
  className,
}: {
  count?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
        className
      )}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-5">
            <Skeleton className={cn('w-full', height)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Full-page placeholder shaped like the authenticated app shell (sidebar +
 * header + content). Shown while the session hydrates on a hard reload, so the
 * user sees the app taking shape instead of a bare spinner on a blank page.
 * Width matches DRAWER_WIDTH (240px) in the real Sidebar.
 */
export function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen" role="status" aria-label="Loading">
      {/* Sidebar */}
      <aside
        className="hidden shrink-0 flex-col gap-3 border-r bg-muted/30 p-4 md:flex"
        style={{ width: 240 }}
      >
        <Skeleton className="mb-4 h-8 w-32" />
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </aside>
      {/* Main column — min-w-0 for the same reason AppShell needs it: a flex
          child will not shrink below its content's intrinsic width. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-16 items-center gap-4 border-b px-6">
          <Skeleton className="h-6 w-40" />
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 p-6">
          <DashboardSkeleton />
        </div>
      </div>
    </div>
  );
}

/** KPI row + chart block + table — a generic dashboard-shaped placeholder. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <CardGridSkeleton count={4} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <TableSkeleton rows={6} />
        </CardContent>
      </Card>
    </div>
  );
}
