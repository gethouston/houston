import type { ConversationCommand } from "../session/conversation-command";
import {
  conversationCommandBusy,
  holdConversationTurn,
} from "../session/conversation-command-gate";
import { runConversationCommand } from "../session/conversation-command-run";
import { json, type RouteContext } from "./http-helpers";
import {
  acceptAdmission,
  type MessageAdmissionInput,
  trackAdmission,
} from "./message-admission";

/**
 * A conversation command (`/clear`, `/compact`) arriving at the message door
 * (conversation-start-turn.ts): an instruction to the conversation, never a
 * prompt for the agent.
 */
export function startConversationCommand(
  ctx: RouteContext,
  id: string,
  command: ConversationCommand,
  text: string,
  nonce: string | undefined,
  admission: MessageAdmissionInput | undefined,
): void {
  // Same refusal as the edit-and-resend rewind: a command tears this
  // conversation's context down, which must never happen behind a turn the
  // user is waiting on. Clients hold sends while a turn runs, so a 409 here
  // means the caller raced one.
  if (conversationCommandBusy(id)) {
    json(ctx.res, 409, { error: "turn running" });
    return;
  }
  // Fire-and-forget like `runTurn`: the outcome (and a compaction can take a
  // model call's worth of seconds) arrives on the conversation's event
  // stream, never on this request. The command marks the conversation held
  // synchronously, so the door's own refusal is already true for the next send.
  const turnId = acceptAdmission(ctx, id, admission);
  if (turnId === false) return;
  holdConversationTurn(
    id,
    trackAdmission(
      id,
      admission,
      runConversationCommand(id, command, text, nonce, turnId),
    ),
  );
  json(ctx.res, 202, { ok: true, id, ...(turnId ? { turnId } : {}) });
}
