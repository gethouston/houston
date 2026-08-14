import type { StoredConversation } from "./conversation-file";
import {
  snapshotConversation,
  type TranscriptShadowSend,
} from "./transcript-shadow";

/**
 * Reads the CURRENT authoritative file state (null = conversation deleted).
 * May return the mutable parse-cache object — {@link resolveRepairSend}
 * clones before the payload leaves this seam.
 */
export type ConversationSnapshotSource = (
  conversationId: string,
) => StoredConversation | null;

/**
 * Resolve a queued repair marker into its wire payload. MUST be called in the
 * same synchronous block that consumes the marker: every op the repair
 * replaced wrote its file before enqueueing, so a snapshot taken here provably
 * contains their effects, while anything arriving during the subsequent send
 * is newer than the snapshot and queues behind it — no op is ever replayed on
 * top of a snapshot that already includes it.
 */
export function resolveRepairSend(
  conversationId: string,
  loadSnapshot: ConversationSnapshotSource,
): TranscriptShadowSend {
  const current = loadSnapshot(conversationId);
  if (!current) {
    // The file is gone (deleted since the repair was queued) — mirror that.
    return { kind: "delete", conversationId };
  }
  return {
    kind: "repair",
    conversationId,
    conversation: snapshotConversation(current),
  };
}
