import { recordConversationKind } from "@houston/domain";

export type RoutineTurnKind = "fire" | "chat";

export function isRoutineConversation(conversationId: string): boolean {
  return recordConversationKind(conversationId) === "routine";
}
