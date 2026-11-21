import type { QueryClient } from "@tanstack/react-query";
import type { ConversationRow } from "./conversation-drafts.ts";
import { queryKeys } from "./query-keys.ts";

interface CachedRow {
  id: string;
  session_key?: string;
}

interface CachedAggregateRow extends CachedRow {
  agent_path?: string;
}

function cachedAggregateVariants(
  queryClient: QueryClient,
): CachedAggregateRow[][] {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: queryKeys.allConversations([]) })
    .filter((query) => Array.isArray(query.state.data))
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .map((query) => query.state.data as CachedAggregateRow[]);
}

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

export function allCachedConversationRows(
  queryClient: QueryClient,
  paths: readonly string[],
): ConversationRow[] {
  return unionConversationRows(
    queryClient.getQueryData<CachedRow[]>(queryKeys.allConversations(paths)),
    ...cachedAggregateVariants(queryClient),
  );
}
