// Extension-qualified so the module resolves under plain `node --test` as well
// as Vite: its null-vs-id contract is what the read-cursor tracker branches on,
// and that has to be assertable against a real query cache.
import { latestCachedAllConversations } from "./all-conversations-cache.ts";
import { activityIdForSessionKey } from "./notification-nav.ts";
import { queryClient } from "./query-client.ts";
import { queryKeys } from "./query-keys.ts";

/** A cached row that can answer "which conversation is this chat?". */
interface ChatKeyRow {
  id: string;
  session_key?: string;
  agent_path?: string;
}

/**
 * The conversation id behind an OPEN chat, resolved from cache alone — or
 * `null` when the caches cannot yet name it.
 *
 * The `["chat-history", agentPath, sessionKey]` query key's third segment is a
 * SESSION key (`activity-<id>`, or a routine's own `routine-<id>`), not a
 * conversation id, so it goes through the board's own derivation
 * ({@link activityIdForSessionKey}) against whatever the cache already holds:
 * the agent's board rows first, else the all-conversations aggregate.
 *
 * Cache reads ONLY, never a fetch. The one caller is a passive query-cache
 * observer (the read-cursor tracker), and in hosted mode a read here would be
 * the thing that wakes a sleeping pod.
 *
 * **Null rather than the raw session key.** Falling back to the session key
 * looked like it kept the mapping stable, but it produced a cursor under a key
 * NOTHING reads: every unread surface looks the cursor up by the conversation's
 * own id (`cursorKey(agent_path, conv.id)`), which for a routine chat has no
 * relation to `routine-<id>` at all. So a cold cache wrote a cursor that could
 * never clear the badge it was meant to clear, and left an orphan behind in a
 * capped store. Skipping the write instead costs nothing: the tracker re-fires
 * on the very cache events that make the lists resolvable, and that pass marks
 * the real key.
 */
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
