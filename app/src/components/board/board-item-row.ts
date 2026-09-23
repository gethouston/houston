import type { KanbanItem } from "@houston-ai/board";
import type { ConversationRow } from "../../lib/conversation-drafts";

/**
 * A mission card read back as the activity row it was built from — the shape
 * the draft seams key a conversation's unsent work by.
 *
 * `metadata` is an open bag, so the session key is taken only when it really is
 * a string: a card carrying none keeps no `session_key` and falls back to the
 * `activity-<id>` stand-in, exactly as a host row without one does.
 */
export function boardItemConversationRow(item: KanbanItem): ConversationRow {
  const sessionKey = item.metadata?.sessionKey;
  return typeof sessionKey === "string"
    ? { id: item.id, session_key: sessionKey }
    : { id: item.id };
}
