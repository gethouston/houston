import { join } from "node:path";
import { loadConversation, saveConversation } from "../store/conversation-file";
import { reportMissionSettle } from "./mission-settle";

export function revokeResume(
  dataDir: string,
  conversationId: string,
  turnId: string,
): void {
  const dir = join(dataDir, "conversations");
  const conv = loadConversation(dir, conversationId);
  const settled = conv?.messages.find(
    (m) =>
      m.role === "assistant" &&
      m.turnId === turnId &&
      m.interrupted?.resumed === true,
  );
  if (conv && settled?.interrupted) {
    delete settled.interrupted.resumed;
    saveConversation(dir, conv);
  }
  reportMissionSettle(conversationId, "error", null, turnId, false);
}

export function resumeWasRecorded(
  dataDir: string,
  conversationId: string,
  prompt: string,
): boolean {
  const conv = loadConversation(join(dataDir, "conversations"), conversationId);
  return (
    conv?.messages.some((m) => m.role === "user" && m.content === prompt) ??
    false
  );
}
