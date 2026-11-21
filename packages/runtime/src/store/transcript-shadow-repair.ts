import type { StoredConversation } from "./conversation-file";
import {
  snapshotConversation,
  type TranscriptShadowSend,
} from "./transcript-shadow";

export type ConversationSnapshotSource = (
  conversationId: string,
) => StoredConversation | null;

export function resolveRepairSend(
  conversationId: string,
  loadSnapshot: ConversationSnapshotSource,
): TranscriptShadowSend {
  const current = loadSnapshot(conversationId);
  if (!current) {
    return { kind: "delete", conversationId };
  }
  return {
    kind: "repair",
    conversationId,
    conversation: snapshotConversation(current),
  };
}
