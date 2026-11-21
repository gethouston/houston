import { rmSync } from "node:fs";
import { join } from "node:path";
import { cleanupClaudeConversation } from "../backends/claude/cleanup";
import { conversationCompactions } from "../store/conversation-compaction";

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
