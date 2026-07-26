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
            retry: 2,
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
