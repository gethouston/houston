import { rmSync } from "node:fs";
import { join } from "node:path";
import { cleanupClaudeConversation } from "../backends/claude/cleanup";
import { conversationCompactions } from "../store/conversation-compaction";

// WHY: Drop the compaction checkpoint first, or a failed teardown answers from deleted turns. ADR-0012
export function clearNativeSessionState(
  dataDir: string,
  conversationId: string,
): void {
  conversationCompactions.clear(conversationId);
  rmSync(join(dataDir, "sessions", conversationId), {
    recursive: true,
    force: true,
  });
  cleanupClaudeConversation(dataDir, conversationId);
}
