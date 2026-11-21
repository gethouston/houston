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

export function startConversationCommand(
  ctx: RouteContext,
  id: string,
  command: ConversationCommand,
  text: string,
  nonce: string | undefined,
  admission: MessageAdmissionInput | undefined,
): void {
  if (conversationCommandBusy(id)) {
    json(ctx.res, 409, { error: "turn running" });
    return;
  }
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
