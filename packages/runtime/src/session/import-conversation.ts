import type { ConversationImportRequest } from "@houston/protocol";
import { importConversationMessages } from "../store/conversations";
import { evict } from "./bus";
import { disposeConversation } from "./chat";
import {
  beginConversationCommand,
  conversationCommandBusy,
} from "./conversation-command-gate";

export async function importConversation(
  id: string,
  request: ConversationImportRequest,
): Promise<"busy" | { imported: number }> {
  if (conversationCommandBusy(id)) return "busy";
  const settle = beginConversationCommand(id);
  try {
    const imported = importConversationMessages(id, request);
    if (imported > 0) {
      await disposeConversation(id, { deleteSessions: true });
      evict(id);
    }
    return { imported };
  } finally {
    settle();
  }
}
