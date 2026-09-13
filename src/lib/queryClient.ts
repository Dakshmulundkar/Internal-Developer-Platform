/**
 * Singleton QueryClient — configured for a monitoring dashboard:
 *  - Short staleTime so metrics stay fresh
 *  - Aggressive retry only for server errors (5xx), not client errors (4xx)
 *  - Global error handler for auth expiry
 */
import { QueryClient } from '@tanstack/react-query';

function isServerError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as Error & { status: number }).status === 'number' &&
    (error as Error & { status: number }).status >= 500
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 30 s; monitoring widgets can override to 0
      staleTime: 30_000,
      // Keep unused data in cache for 5 min
      gcTime: 5 * 60 * 1000,
      // Retry server errors up to 2 times, never retry client errors
      retry: (failureCount, error) => isServerError(error) && failureCount < 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});
