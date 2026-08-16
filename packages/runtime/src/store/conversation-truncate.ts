import { loadConversation, saveConversation } from "./conversation-file";

/**
 * Transcript truncation for edit-and-resend (PRODUCT-1217): cut the canonical
 * transcript at a user turn so the client can resend an edited version of that
 * message. Pure dir-parameterized file logic like conversation-file.ts; the
 * session/bus invalidation that must accompany a cut lives in
 * session/truncate-turn.ts — never call this without it.
 */

/**
 * Drop every message from the FIRST message of `turnId` (its user message)
 * through the end of the transcript, and stamp `needsSessionReplay` so the
 * next turn replays the kept messages into its fresh backend session
 * (HOU-951). Returns how many messages were removed, or null when the
 * conversation or the turn is unknown (nothing was written).
 */
export function truncateConversationMutationAt(
  dir: string,
  id: string,
  turnId: string,
) {
  const conv = loadConversation(dir, id);
  if (!conv) return null;
  const at = conv.messages.findIndex((m) => m.turnId === turnId);
  if (at === -1) return null;
  const removed = conv.messages.length - at;
  conv.messages = conv.messages.slice(0, at);
  conv.needsSessionReplay = true;
  conv.updatedAt = Date.now();
  saveConversation(dir, conv);
  return { removed, conversation: conv };
}

/**
 * One-shot read of the replay marker: true exactly once after a truncation,
 * cleared on the same read. exec-turn calls this every turn — the common
 * un-truncated path is a cached load and a boolean check.
 */
export function consumeSessionReplayAt(dir: string, id: string): boolean {
  const conv = loadConversation(dir, id);
  if (!conv?.needsSessionReplay) return false;
  delete conv.needsSessionReplay;
  saveConversation(dir, conv);
  return true;
}
