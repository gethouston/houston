import { type ConversationVM, conversationScope } from "@houston/sdk";
import { liveTurn } from "./turn-stream";
import { conversationStore } from "./vm";

export function conversationBusy(
  agentPath: string,
  sessionKey: string,
): boolean {
  const snap = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return snap?.running === true || liveTurn(agentPath, sessionKey) === "held";
}
