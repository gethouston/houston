import type { Query, QueryClient } from "@tanstack/react-query";
import { cancelAllConnectFlows } from "../stores/connect-flow.ts";
import { isSettledAssistantAddress } from "./assistant-address-cache.ts";
import { queryKeys } from "./query-keys.ts";

const SPACE_INVARIANT_KEY_ROOTS: ReadonlySet<string> = new Set([
  String(queryKeys.session()[0]),
  String(queryKeys.onboardingPending()[0]),
  String(queryKeys.onboardingCompleted(null)[0]),
]);

export function isSpaceInvariantQueryKey(key: readonly unknown[]): boolean {
  return SPACE_INVARIANT_KEY_ROOTS.has(String(key[0]));
}

export function heldOutOfCatchUpSweep(query: Query): boolean {
  return (
    isSpaceInvariantQueryKey(query.queryKey) || isSettledAssistantAddress(query)
  );
}

export function resetCacheForSpaceChange(
  queryClient: QueryClient,
  orgChanged: boolean,
): void {
  if (!orgChanged) return;
  cancelAllConnectFlows();
  queryClient.removeQueries({
    predicate: (query) =>
      !isSpaceInvariantQueryKey(query.queryKey) &&
      !isSettledAssistantAddress(query),
  });
}
