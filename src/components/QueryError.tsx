'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractError } from '@/lib/errors';

/**
 * Inline fallback for a failed TanStack Query read. Pairs with `query.isError`
 * so a failed fetch is shown as an error (with retry) instead of being
 * indistinguishable from an empty result.
 */
export default function QueryError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-10 text-center ${className ?? ''}`}
    >
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{extractError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
