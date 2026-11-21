import { createHash } from "node:crypto";
import type { ApprovalStore } from "@houston/host/src/assistant/approvals";
import { prepareMessageReceipts } from "@houston/host/src/assistant/message-receipts";
import { messageRetryContent } from "@houston/protocol";
import type { AdmittedMessages } from "./turn-admitted-messages";
import type { TurnRequest } from "./types";

export function receiveTurnMessage(
  approvals: ApprovalStore,
  admitted: AdmittedMessages,
  agentId: string,
  received: TurnRequest,
  damaged = false,
): void {
  const turn: TurnRequest = damaged
    ? { ...received, approvals: undefined, grants: undefined }
    : received;
  const body: Record<string, unknown> = {
    text: turn.text,
    mode: turn.mode,
    ...(turn.nonce !== undefined ? { nonce: turn.nonce } : {}),
    ...(turn.displayText ? { displayText: turn.displayText } : {}),
    ...(turn.provider ? { provider: turn.provider } : {}),
    ...(turn.model ? { model: turn.model } : {}),
    ...(turn.effort ? { effort: turn.effort } : {}),
    ...(turn.mentions ? { mentions: turn.mentions } : {}),
    ...(turn.approvals !== undefined ? { approvals: turn.approvals } : {}),
    ...(turn.grants ? { grants: turn.grants } : {}),
  };
  const actor = turn.actingAs?.userId ?? "";
  const prepared = prepareMessageReceipts({
    approvals,
    agentId,
    conversationId: turn.conversationId,
    actor,
    ...(turn.actingToken ? { grantActor: turn.actingToken } : {}),
    body: Buffer.from(JSON.stringify(body)),
    parsed: body,
    durableReceipt:
      turn.nonce !== undefined ? admitted.receipt(turn.nonce) : null,
  });
  if (turn.nonce && !prepared.duplicate)
    admitted.record(
      turn.nonce,
      createHash("sha256")
        .update(messageRetryContent(body, actor))
        .digest("hex"),
      turn.turnId ?? "pooled",
    );
}
