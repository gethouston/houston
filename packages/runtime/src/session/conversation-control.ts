import { rmSync } from "node:fs";
import { join } from "node:path";
import type { TurnMode } from "@houston/protocol";
import { cleanupClaudeConversation } from "../backends/claude/cleanup";
import { config } from "../config";
import { publish } from "./bus";
import { conversations } from "./conversation-cache";

/**
 * Everything a caller can do to a conversation from OUTSIDE its running turn:
 * flip the live mode, abort the in-flight turn, drop the session. Each acts on
 * the cached session, so each answers honestly when the conversation isn't
 * cached (e.g. after a runtime restart) instead of pretending it acted.
 */

/**
 * Apply a Mode-pill switch to a conversation's EXECUTING turn (Claude Code's
 * shift+tab semantics): mutate the live-mode ref exec-turn parked on the
 * Conversation, so the running turn's tools adopt the new mode at their next
 * decision point — an auto flip un-gates integration actions immediately, a
 * plan flip starts refusing writes with a message that tells the model why.
 *
 * Returns whether a live turn actually adopted it: `false` means no turn is
 * executing (or the conversation isn't cached), which is benign — the client's
 * next send pins the mode itself, so there is nothing to apply here.
 */
export function setLiveTurnMode(id: string, mode: TurnMode): boolean {
  const conv = conversations.get(id);
  if (!conv?.liveMode) return false;
  conv.liveMode.current = mode;
  return true;
}

/**
 * Abort the in-flight turn for a conversation. Returns whether a live turn was
 * actually aborted: `false` means nothing was in flight — the conversation isn't
 * cached (e.g. the runtime restarted), so there is no turn to stop and no
 * terminal event will follow. The caller uses this to settle a card that's stuck
 * "running" because its owning turn died without ever settling it.
 */
export async function cancelTurn(id: string): Promise<boolean> {
  const conv = conversations.get(id);
  if (!conv) return false;
  // Surface a clear stop confirmation in the chat. Published BEFORE the abort so
  // it settles the turn first; pi's own abort rejection (if any) then arrives at
  // the already-settled stream and is ignored, so the user sees this one friendly
  // message instead of a raw abort error. STOPPED_BY_USER is matched verbatim by
  // the web adapter to render it as a neutral "you stopped it", not a failure.
  // Stamped with the EXECUTING turn's id (absent when the stop raced turn end)
  // so the stop terminates exactly the turn the user watched.
  //
  // Mark the executing turn as stopped so execTurn can stamp it durably: pi
  // routes the aborted turn down the usage path (prompt() resolves clean, no
  // provider_error), so without this marker the persisted assistant message
  // would carry no trace of the stop and a reload would re-derive it as a clean
  // done. Only when a turn is actually executing (turnId set) — a stop that
  // raced turn end has nothing to mark.
  if (conv.turnId) conv.stoppedTurnId = conv.turnId;
  publish(id, {
    type: "error",
    data: { message: STOPPED_BY_USER },
    turnId: conv.turnId,
  });
  await conv.session.abort();
  return true;
}

/**
 * The verbatim message a user-initiated stop surfaces. The control plane's relay
 * emits the same string on abort, and the web adapter matches it (isStoppedByUser)
 * to settle the chat as an intentional stop — back to the user, never a red error.
 */
export const STOPPED_BY_USER = "Stopped by user";

/**
 * Drop a conversation's live session (aborting any in-flight turn) and, when
 * requested, its on-disk session history. Used by DELETE /conversations/:id.
 *
 * Two backends store history in two places, so deletion clears both: pi's
 * per-conversation transcript dir (`<dataDir>/sessions/<id>`), and the Claude
 * Agent SDK backend's `sessions.json` mapping + transcript JSONL. The Claude
 * cleanup is called unconditionally — it is a no-op for a conversation that never
 * ran on the anthropic backend — so a deleted anthropic chat leaves no SDK state
 * behind without chat.ts needing to know which provider the conversation used.
 */
export async function disposeConversation(
  id: string,
  opts?: { deleteSessions?: boolean },
): Promise<void> {
  const conv = conversations.get(id);
  if (conv) {
    conversations.delete(id);
    await conv.session.abort();
    conv.session.dispose();
  }
  if (opts?.deleteSessions) {
    rmSync(join(config.dataDir, "sessions", id), {
      recursive: true,
      force: true,
    });
    cleanupClaudeConversation(config.dataDir, id);
  }
}
