/**
 * Cache-variant fallback for the all-conversations aggregate.
 *
 * The aggregate's query key embeds EVERY agent's folderPath from the async,
 * non-persisted agents roster (`["all-conversations", ...agentPaths]`), so the
 * IndexedDB-restored entry (query-persist.ts) only re-attaches when the roster
 * resolves byte-identical — same paths, same order. Any drift (roster still
 * loading, an agent added/removed/reordered since the persist) strands the
 * restored lists under a stale key, and everything derived from the aggregate
 * (sidebar needs-you badges, Mission Control, the command palette) blanks
 * until the live fan-out returns — which a cold pod holds for its whole wake.
 *
 * This helper serves the NEWEST successfully-fetched variant of the key as
 * PLACEHOLDER data: painted immediately, marked `isPlaceholderData`, never
 * persisted, and always replaced by the real fetch when it lands.
 *
 * Kept dependency-free (QueryClient only) so `node --test` exercises it.
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

/** Newest successful data under any `["all-conversations", ...]` key. */
export function latestCachedAllConversations<T>(
  queryClient: QueryClient,
): T | undefined {
  let bestData: T | undefined;
  let bestUpdatedAt = -1;
  const queries = queryClient
    .getQueryCache()
    // Prefix match: every roster variant of the aggregate key.
    .findAll({ queryKey: queryKeys.allConversations([]) });
  for (const query of queries) {
    const { status, data, dataUpdatedAt } = query.state;
    if (status !== "success" || data === undefined) continue;
    if (dataUpdatedAt > bestUpdatedAt) {
      bestUpdatedAt = dataUpdatedAt;
      bestData = data as T;
    }
  }
  return bestData;
}
