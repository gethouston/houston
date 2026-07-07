/**
 * Which TanStack queries are worth persisting to disk — the policy half of
 * the list-query persistence (follow-up to HOU-712). Pure and dependency-free
 * so it unit-tests under node:test; the wiring lives in query-persist.ts.
 *
 * Only the POD-HELD list surfaces qualify: conversation lists and board
 * activities live on a cloud agent's engine pod, and the gateway holds their
 * reads for the whole pod cold start — exactly the queries whose absence
 * blanks the sidebar/board. Everything else either answers from the gateway
 * without a pod wake (agents, org) or is already covered by the conversation
 * transcript cache.
 */

/** Query-key prefixes (see query-keys.ts) restored on boot as stale data. */
export const PERSISTED_QUERY_PREFIXES = [
  "activity",
  "conversations",
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
