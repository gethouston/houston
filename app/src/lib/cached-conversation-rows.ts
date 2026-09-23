/**
 * What a DELETE SEAM reads to derive draft keys: every mission row the cache
 * can still name for the conversations about to disappear.
 *
 * Its own module because the rule here is the opposite of the board's. A board
 * paints the freshest ANSWER, so it takes one source and stops; a delete seam
 * must not miss a row, because a row it cannot see takes the conversation key —
 * and the composer text and half-walked interaction card parked under it — with
 * it, unreachable for the life of the session. So every seam unions both cache
 * sources, and all three (agent delete, mission bulk delete, Mission Control
 * bulk delete) derive their keys the same way.
 *
 * Kept dependency-free (QueryClient only) so `node --test` exercises it.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { ConversationRow } from "./conversation-drafts.ts";
import { queryKeys } from "./query-keys.ts";

/** Any cached row, whatever else its source carries. */
interface CachedRow {
  id: string;
  session_key?: string;
}

/** An aggregate row, which also names the agent whose board it belongs to. */
interface CachedAggregateRow extends CachedRow {
  agent_path?: string;
}

/**
 * Every successfully-fetched variant of the cross-agent aggregate, newest
 * sweep first — so the freshest row wins an id, and an older roster's sweep
 * still contributes the missions no newer one lists.
 *
 * All of them, not just the newest: the aggregate's key embeds every agent's
 * folder path, so each roster the session has seen (still loading, an agent
 * added, removed or reordered) left its rows under a key of its own.
 */
function cachedAggregateVariants(
  queryClient: QueryClient,
): CachedAggregateRow[][] {
  return (
    queryClient
      .getQueryCache()
      // Prefix match: every roster variant of the aggregate key.
      .findAll({ queryKey: queryKeys.allConversations([]) })
      .filter((query) => Array.isArray(query.state.data))
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
      .map((query) => query.state.data as CachedAggregateRow[])
  );
}

/**
 * Every row the given sources name, first mention of an id winning, projected
 * to the two fields a draft key is built from.
 *
 * A stale row costs nothing — clearing a key nothing is parked under is a no-op
 * — so the union is deliberately generous where the board's read is strict.
 */
export function unionConversationRows(
  ...sources: readonly (readonly CachedRow[] | undefined)[]
): ConversationRow[] {
  const byId = new Map<string, ConversationRow>();
  for (const source of sources) {
    for (const row of source ?? []) {
      if (byId.has(row.id)) continue;
      byId.set(
        row.id,
        row.session_key === undefined
          ? { id: row.id }
          : { id: row.id, session_key: row.session_key },
      );
    }
  }
  return [...byId.values()];
}

/**
 * ONE agent's mission rows: the served per-agent read AND every aggregate
 * variant's rows for that agent.
 *
 * The per-agent query is only swept while that agent's board is open, so it is
 * often absent — or cached EMPTY from a sweep that ran while the agent was
 * idle, which is the case a served-read-first fallback gets wrong: `[]` is an
 * answer, so the fallback never fires and the aggregate's missions stay masked.
 */
export function allCachedActivityRows(
  queryClient: QueryClient,
  agentPath: string,
): ConversationRow[] {
  return unionConversationRows(
    queryClient.getQueryData<CachedRow[]>(queryKeys.activity(agentPath)),
    ...cachedAggregateVariants(queryClient).map((rows) =>
      rows.filter((row) => row.agent_path === agentPath),
    ),
  );
}

/**
 * Every agent's mission rows, for a Mission Control delete: the aggregate as
 * the CURRENT roster keys it, then every other variant of it.
 *
 * The served key alone is not enough for the same reason the board paints a
 * placeholder from a neighbouring variant: a roster that is still resolving (or
 * that has drifted since the last sweep) leaves this key empty while the
 * missions the user is deleting sit under the key the last roster made.
 */
export function allCachedConversationRows(
  queryClient: QueryClient,
  paths: readonly string[],
): ConversationRow[] {
  return unionConversationRows(
    queryClient.getQueryData<CachedRow[]>(queryKeys.allConversations(paths)),
    ...cachedAggregateVariants(queryClient),
  );
}
