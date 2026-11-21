import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

const IDENTITY_INVARIANT_KEY_ROOTS: ReadonlySet<string> = new Set([
  String(queryKeys.session()[0]),
]);

export function resetQueryCacheForIdentityChange(
  queryClient: QueryClient,
): void {
  queryClient.removeQueries({
    predicate: (query) =>
      !IDENTITY_INVARIANT_KEY_ROOTS.has(String(query.queryKey[0])),
  });
  queryClient.getMutationCache().clear();
}
