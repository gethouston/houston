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

/**
 * A cached conversation row as the board-seeding fallback reads it. Mirrors
 * `RawConversation` (lib/tauri.ts) structurally — conversations are derived
 * 1:1 from board activities (`activityToConversation`), so the row carries
 * everything a mission card renders.
 */
interface CachedConversationRow {
  id: string;
  title: string;
  description: string;
  status: string;
  session_key?: string;
  updated_at?: string;
  agent_path: string;
  agent?: string;
  routine_id?: string;
}

/** A board activity recovered from a cached conversation row. */
export interface CachedBoardActivity {
  id: string;
  title: string;
  description: string;
  status: string;
  session_key?: string;
  updated_at?: string;
  agent?: string;
  routine_id?: string;
}

/**
 * One agent's board rows, recovered from the freshest cached conversation
 * list that has any (the per-agent list, or any roster variant of the
 * aggregate — both restored from disk at boot).
 *
 * Why the board needs this: the per-agent `["activity", X]` query is only
 * fetched while X's board is open AND only reaches the disk mirror when that
 * session outlives the pod wake plus the persister's write throttle — so on a
 * cold open it is often absent for the very agent being looked at. The
 * aggregate, by contrast, is swept every session for every agent (the sidebar
 * always mounts it): whenever the sidebar can paint its badges, this can
 * paint the same missions as cards instead of empty columns held for the
 * whole pod wake.
 *
 * Empty is not evidence: rows can be missing because the agent truly has no
 * missions OR because a cached sweep skipped it, so no-rows returns
 * `undefined` — preserving the caller's "still loading" state — never `[]`.
 */
export function latestCachedAgentActivities(
  queryClient: QueryClient,
  agentPath: string,
): CachedBoardActivity[] | undefined {
  let bestRows: CachedConversationRow[] | undefined;
  let bestUpdatedAt = -1;
  const consider = (
    rows: CachedConversationRow[] | undefined,
    updatedAt: number,
  ) => {
    if (!rows || rows.length === 0 || updatedAt <= bestUpdatedAt) return;
    bestUpdatedAt = updatedAt;
    bestRows = rows;
  };

  const own = queryClient.getQueryState<CachedConversationRow[]>(
    queryKeys.conversations(agentPath),
  );
  if (own?.status === "success" && own.data)
    consider(own.data, own.dataUpdatedAt);

  const aggregates = queryClient
    .getQueryCache()
    .findAll({ queryKey: queryKeys.allConversations([]) });
  for (const query of aggregates) {
    const { status, data, dataUpdatedAt } = query.state;
    if (status !== "success" || !Array.isArray(data)) continue;
    consider(
      (data as CachedConversationRow[]).filter(
        (row) => row.agent_path === agentPath,
      ),
      dataUpdatedAt,
    );
  }

  return bestRows?.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    session_key: row.session_key,
    updated_at: row.updated_at,
    agent: row.agent,
    routine_id: row.routine_id,
  }));
}
