import type { KanbanItem } from "@houston-ai/board";
import type { ConversationRow } from "../../lib/conversation-drafts";

export function boardItemConversationRow(item: KanbanItem): ConversationRow {
  const sessionKey = item.metadata?.sessionKey;
  return typeof sessionKey === "string"
    ? { id: item.id, session_key: sessionKey }
    : { id: item.id };
}
