import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // SSE invalidation is the correctness path; this prevents needless
      // remount fetches between events.
      staleTime: 30_000,
      // Keep an unvisited screen warm for a normal working session.
      gcTime: 30 * 60_000,
      // Don't retry on error — our Tauri invoke wrapper already shows toasts
      retry: false,
      // Refetch when window regains focus (user alt-tabs back)
      refetchOnWindowFocus: true,
    },
  },
});
