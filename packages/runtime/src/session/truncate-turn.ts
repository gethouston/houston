import { truncateConversation } from "../store/conversations";
import { evict } from "./bus";
import { disposeConversation } from "./chat";
import {
  beginConversationCommand,
  conversationCommandBusy,
} from "./conversation-command-gate";

export type TruncateTurnResult = "busy" | "not_found" | { removed: number };

export async function truncateConversationTurn(
  id: string,
  turnId: string,
): Promise<TruncateTurnResult> {
  if (conversationCommandBusy(id)) return "busy";
  const settle = beginConversationCommand(id);
  try {
    const cut = truncateConversation(id, turnId);
    if (!cut) return "not_found";
    await disposeConversation(id, { deleteSessions: true });
    evict(id);
    return cut;
  } finally {
    settle();
  }
}
