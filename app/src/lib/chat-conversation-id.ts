import { latestCachedAllConversations } from "./all-conversations-cache.ts";
import { activityIdForSessionKey } from "./notification-nav.ts";
import { queryClient } from "./query-client.ts";
import { queryKeys } from "./query-keys.ts";

interface ChatKeyRow {
  id: string;
  session_key?: string;
  agent_path?: string;
}

export function conversationIdForChat(
  agentPath: string,
  sessionKey: string,
): string | null {
  const board = queryClient.getQueryData<ChatKeyRow[]>(
    queryKeys.activity(agentPath),
  );
  const rows =
    board ??
    (latestCachedAllConversations<ChatKeyRow[]>(queryClient) ?? []).filter(
      (row) => row.agent_path === agentPath,
    );
  return activityIdForSessionKey(rows, sessionKey);
}
