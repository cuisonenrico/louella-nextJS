'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

/**
 * A page that crashes while rendering. Lives inside the `(app)` layout, so the
 * sidebar and header stay and only the content area is replaced; the root
 * `error.tsx` sits above the shell and would take the navigation with it.
 *
 * Retry also drops the query cache: a crash caused by a bad response would
 * otherwise re-render from the same cached data and crash again.
 */
export default function AppError({
  error,
  retry,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const again = retry ?? unstable_retry ?? reset ?? (() => window.location.reload());

  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">This page ran into a problem</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Nothing you saved is lost. Try again, or open another page from the menu. If it keeps
          happening, contact an administrator.
        </p>
        {error.digest && <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            queryClient.resetQueries();
            again();
          }}
        >
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
