import type { Query, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

const ROOT = String(queryKeys.assistant(null)[0]);

export function isSettledAssistantAddress(query: Query): boolean {
  return (
    query.queryKey[0] === ROOT &&
    query.queryKey.length === 2 &&
    query.state.status === "success" &&
    query.state.fetchStatus === "idle"
  );
}

export function forgetAssistantAddresses(
  queryClient: QueryClient,
  listedSpaceIds: readonly string[],
): void {
  const listed = new Set<unknown>(listedSpaceIds);
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey[0] === ROOT && !listed.has(query.queryKey[1]),
  });
}
