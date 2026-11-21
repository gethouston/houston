import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

export function latestCachedAllConversations<T>(
  queryClient: QueryClient,
): T | undefined {
  let bestData: T | undefined;
  let bestUpdatedAt = -1;
  const queries = queryClient
    .getQueryCache()
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
  provider?: string;
  model?: string;
  mode?: "execute" | "plan" | "auto";
}

export interface CachedBoardActivity {
  id: string;
  title: string;
  description: string;
  status: string;
  session_key?: string;
  updated_at?: string;
  agent?: string;
  routine_id?: string;
  provider?: string;
  model?: string;
  mode?: "execute" | "plan" | "auto";
}

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
    ...(row.provider !== undefined && { provider: row.provider }),
    ...(row.model !== undefined && { model: row.model }),
    ...(row.mode !== undefined && { mode: row.mode }),
  }));
}
