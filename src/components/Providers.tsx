'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TopLoader } from '@/components/loading/TopLoader';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // The DB is cross-region (~300ms/statement), so brief blips are
            // common. Retry reads a couple of times with exponential backoff
            // (capped at 5s) before surfacing a hard error to the user.
            //
            // But only retry what retrying can fix. A 4xx is the server's
            // considered answer and will say the same thing three times; a 500
            // from a failing query likewise. Retrying those bought nothing and
            // cost ~7s of skeletons before the error UI could appear. Retry
            // network-level faults, timeouts and 429/503, which are genuinely
            // transient.
            retry: (failureCount, error) => {
              if (failureCount >= 2) return false;
              const status = (error as { response?: { status?: number } })
                ?.response?.status;
              if (status == null) return true; // no response: network fault
              return status === 429 || status === 503;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5_000),
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Never auto-retry writes — they are not idempotent here.
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TopLoader />
      <TooltipProvider>
        <AuthProvider>{children}</AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
