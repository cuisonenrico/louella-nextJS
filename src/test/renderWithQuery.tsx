import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Renders a screen with a fresh QueryClient and the providers the app supplies.
 *
 * `TooltipProvider` mirrors `components/Providers`: screens using tooltips throw
 * on mount without it, which reads as a component failure rather than a missing
 * harness. `AuthProvider` is deliberately not included — specs mock `useAuth`
 * directly so they can choose a permission set.
 *
 * Retries are off so a rejected query surfaces its error state on the first
 * tick instead of the test waiting out the app's backoff, and each call gets its
 * own client so cached data cannot leak between tests.
 */
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );

  return { queryClient, ...render(ui, { wrapper }) };
}
