/**
 * Which TanStack queries are worth persisting to disk — the policy half of
 * the list-query persistence (follow-up to HOU-712). Pure and dependency-free
 * so it unit-tests under node:test; the wiring lives in query-persist.ts.
 *
 * Only the POD-HELD list surfaces qualify: an agent's board activities and the
 * cross-agent conversation sweep live on cloud engine pods, and the gateway
 * holds their reads for the whole pod cold start — exactly the queries whose
 * absence blanks the board and the sidebar. Everything else either answers
 * from the gateway without a pod wake (agents, org) or is already covered by
 * the conversation transcript cache.
 */

import type { QueryClient } from "@tanstack/react-query";

/** Query-key prefixes (see query-keys.ts) restored on boot as stale data. */
export const PERSISTED_QUERY_PREFIXES = [
  "activity",
  "all-conversations",
] as const;

/**
 * How long a persisted list stays restorable, and how long the in-memory
 * cache keeps an unobserved restored query alive. The two MUST match: the
 * persister mirrors the in-memory cache, so a query garbage-collected before
 * it is re-observed would be dropped from disk on the next persist sweep —
 * silently losing another agent's lists while the user parks on one chat.
 */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

/** Whether a query key belongs to a persisted list surface. */
export function isPersistedQueryKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return (
    typeof head === "string" &&
    (PERSISTED_QUERY_PREFIXES as readonly string[]).includes(head)
  );
}

/**
 * Marks every restored list stale, whatever its age (HOU-198). The event
 * stream has no replay, so a change made while the app was closed (a mission
 * started through the public API, a routine run, a teammate's edit) never
 * arrives as an event. A list restored younger than its staleTime (the
 * cross-agent sweep's is 10 minutes) would otherwise paint as fresh after a
 * quick relaunch and skip the read that shows the change. Nothing is fetched
 * here: each observer refetches when it subscribes once the restore settles.
 */
export function markRestoredListsStale(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => isPersistedQueryKey(query.queryKey),
    refetchType: "none",
  });
}
