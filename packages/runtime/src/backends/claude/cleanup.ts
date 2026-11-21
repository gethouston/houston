import { serverClaudeLayout } from "./paths";
import { createSessionsStore } from "./sessions-store";

export function cleanupClaudeConversation(
  dataDir: string,
  conversationId: string,
): void {
  const layout = serverClaudeLayout(dataDir);
  createSessionsStore(layout).purge(conversationId);
}
