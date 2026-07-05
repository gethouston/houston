import { createSessionsStore } from "./sessions-store";

/**
 * Drop everything the Claude Agent SDK backend wrote for a conversation: its
 * `sessions.json` mapping and its transcript JSONL. Called from
 * `disposeConversation` on delete so an anthropic chat leaves no SDK state
 * behind. Idempotent and a no-op for a conversation that never ran on this
 * backend (no mapping), so `disposeConversation` can call it unconditionally
 * without first knowing which provider the conversation used.
 *
 * The path logic lives in the sessions store (it owns the SDK on-disk layout);
 * this is just the delete-side entry point so chat.ts never reconstructs it.
 */
export function cleanupClaudeConversation(
  dataDir: string,
  conversationId: string,
): void {
  createSessionsStore(dataDir).purge(conversationId);
}
