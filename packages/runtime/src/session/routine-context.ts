import { recordConversationKind } from "@houston/domain";

/**
 * THE ROUTINE CONTEXT RULE: every FIRE of a routine (a schedule, a trigger or
 * Run now) starts on a fresh backend session.
 *
 * A shared routine (the default chat mode) runs every fire in ONE
 * conversation, and resuming its backend session (pi's session file, the
 * Claude SDK session) re-sends every earlier run, tool output included, on
 * every model call of every fire. Unattended, that is what drained accounts:
 * routines that fire every few minutes re-read up to 100k tokens of old runs
 * per call. So a fire opens a fresh session carrying only a short digest of
 * the latest runs and the path of a file holding their full replies
 * (routine-replay.ts), and the model reads further back only when the
 * routine's instructions need it. The digest is built from Houston's own
 * transcript, so the start cannot fail the way a summarization can.
 *
 * A PERSON chatting in the routine's chat gets the ordinary chat treatment:
 * their turns resume the session the last fire opened, and autocompact
 * applies. A per-run routine gets a new conversation every fire, so it has
 * nothing earlier to carry and starts fresh by construction.
 */

/**
 * Who started this turn of a routine chat: the routine's own fire (a schedule,
 * a trigger or Run now) or a person chatting in it.
 */
export type RoutineTurnKind = "fire" | "chat";

/** Whether this conversation is a routine's chat (shared or per-run). */
export function isRoutineConversation(conversationId: string): boolean {
  return recordConversationKind(conversationId) === "routine";
}
