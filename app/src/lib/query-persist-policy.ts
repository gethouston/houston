import type { QueryClient } from "@tanstack/react-query";

export const PERSISTED_QUERY_PREFIXES = [
  "activity",
  "all-conversations",
] as const;

export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export function isPersistedQueryKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return (
    typeof head === "string" &&
    (PERSISTED_QUERY_PREFIXES as readonly string[]).includes(head)
  );
}

export function markRestoredListsStale(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => isPersistedQueryKey(query.queryKey),
    refetchType: "none",
  });
}
