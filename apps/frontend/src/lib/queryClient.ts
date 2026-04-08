import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton React Query client configured for on-prem internal tool usage.
 *
 * Defaults:
 * - staleTime: 25s (data is fresh for 25 seconds after fetch)
 * - gcTime: 5 minutes (cache is kept for 5 minutes after last use)
 * - refetchInterval: 30s (background polling, DASH-04)
 * - refetchOnWindowFocus: false (on-prem users rarely tab back)
 * - retry: 1 (one retry on transient network errors)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 25_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: 1000,
    },
  },
});
