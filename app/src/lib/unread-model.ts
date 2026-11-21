import { isSetupChatMode } from "./integration-chat-setup.ts";
import {
  isRelevantToMe,
  latestMentionAtFor,
  type RelevanceConversation,
} from "./mission-relevance.ts";
import {
  cursorKey,
  mentionReadFloorFor,
  type ReadCursorStore,
  readFloorFor,
} from "./read-cursors.ts";

export interface UnreadConversationInput extends RelevanceConversation {
  id: string;
  agent_path: string;
  type: "primary" | "activity";
  agent?: string | null;
  updated_at?: string;
}

export function isUnreadForMe(
  conv: UnreadConversationInput,
  store: ReadCursorStore,
  selfId: string | null,
): boolean {
  if (selfId === null) return false;
  if (isSetupChatMode(conv.agent)) return false;
  if (!isRelevantToMe(conv, selfId)) return false;

  const key = cursorKey(conv.agent_path, conv.id);
  const mentionedAt = latestMentionAtFor(conv, selfId);
  if (mentionedAt !== null && mentionedAt > mentionReadFloorFor(store, key))
    return true;

  if (!conv.updated_at) return false;
  const updatedAt = Date.parse(conv.updated_at);
  if (Number.isNaN(updatedAt)) return false;
  return updatedAt > readFloorFor(store, key);
}
