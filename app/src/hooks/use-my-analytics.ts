import type { CreatorAnalytics } from "@houston-ai/engine-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { getEngine } from "../lib/engine";
import { useSession } from "./use-session";

/**
 * The caller's per-UTC-day install analytics over their owned agents
 * (`GET /me/analytics?days=`), read only when signed in — the gateway route
 * needs the caller's session bearer. `days` (server ceiling 90) rides the query
 * key so switching the 7d / 30d / 90d range caches each window independently.
 */
export function useMyAnalytics(
  days?: number,
): UseQueryResult<CreatorAnalytics> {
  const { data: session } = useSession();
  return useQuery<CreatorAnalytics>({
    queryKey: ["store-my-analytics", days ?? null],
    queryFn: () => getEngine().getMyStoreAnalytics(days),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}
