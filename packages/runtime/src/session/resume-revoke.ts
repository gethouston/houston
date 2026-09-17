import { join } from "node:path";
import { loadConversation, saveConversation } from "../store/conversation-file";
import { reportMissionSettle } from "./mission-settle";

/**
 * Taking back a promise the boot settle already made (PRODUCT-1785).
 *
 * The settle writes the interrupted reply BEFORE the resume runs, and stamps
 * `interrupted.resumed` on it — that flag is what makes the chat read "picking
 * up where it left off" instead of "say continue", and it is why the settle
 * deliberately does NOT report the mission's terminal state (the resumed turn
 * would own it). Every path where the resume then never starts must undo both,
 * or the transcript promises a continuation that never comes and the board card
 * stays Running forever.
 */
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
  // The settle skipped this for the turn it expected to run again; nothing else
  // will ever settle the card, so it is reported here instead. Fire-and-forget
  // and idempotent — the host applies at most one settle per mission.
  reportMissionSettle(conversationId, "error", null);
}

/**
 * Whether the resume's hidden prompt actually made it into the transcript.
 *
 * `runTurn` refuses a turn it cannot start (no provider, a session that will
 * not build) by publishing an `error` event and RESOLVING normally, without
 * recording a user message — indistinguishable from a healthy resume to the
 * caller's `await`. The recorded prompt is the only proof the turn began.
 */
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
