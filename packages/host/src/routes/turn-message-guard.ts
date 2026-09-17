import type { ApprovalStore } from "../assistant/approvals";
import { readMessageAdmission } from "../assistant/message-admission-read";
import {
  ApprovalMessageRefusal,
  prepareMessageReceipts,
} from "../assistant/message-receipts";
import type { AgentId } from "../domain/types";
import type { Vfs } from "../vfs";
import { parseTurnBody } from "./turn-body";

/**
 * APPROVAL RECEIPTS (assistant/receipts.ts) and message identity, decided
 * before a turn POST reaches the runtime: a destructive Houston operation is
 * authorized by the person's OWN message, and this is the only seam it passes
 * through - so the yes is recorded here, where no runtime can author one.
 *
 * Approvals are host-owned wherever the host runs, so this drains and inspects
 * the body on desktop and self-host too. The bytes it returns are the bytes to
 * forward: the request's `approvals` field and any caller-authored retry
 * fingerprint are gone by then.
 */
export type TurnMessageGuard =
  | {
      kind: "admitted";
      /** The body to forward, host-owned fields removed. */
      body: Buffer;
      /** Frees this request's own nonce reservation; absent for a replay. */
      release?: () => void;
      /** The runtime already accepted this exact message: do not re-prepare it. */
      duplicate: boolean;
    }
  | { kind: "refused"; status: 400 | 409 | 503; code: string };

/** Each definitive refusal answers the client in the terms it can act on. */
function statusFor(code: ApprovalMessageRefusal["code"]): 400 | 409 | 503 {
  if (code === "invalid_nonce") return 400;
  return code === "nonce_conflict" ? 409 : 503;
}

export async function guardTurnMessage(input: {
  approvals: ApprovalStore;
  vfs: Vfs | undefined;
  dataRoot: string;
  agentId: AgentId;
  conversationId: string;
  actor: string;
  body: Buffer;
}): Promise<TurnMessageGuard> {
  // ONE parse for both readers: the durable admission lookup and the receipt
  // preparation ask the same bytes the same question.
  const parsed = parseTurnBody(input.body);
  try {
    const durableReceipt = await readMessageAdmission(
      input.vfs,
      input.dataRoot,
      input.conversationId,
      parsed,
    );
    const prepared = prepareMessageReceipts({
      approvals: input.approvals,
      agentId: input.agentId,
      conversationId: input.conversationId,
      actor: input.actor,
      body: input.body,
      parsed,
      durableReceipt,
    });
    return {
      kind: "admitted",
      body: prepared.body,
      release: prepared.release,
      duplicate: prepared.duplicate === true,
    };
  } catch (error) {
    // A refusal is about THIS message and is answered. Anything else - a
    // corrupt receipt, a broken data root - is a host failure and stays one.
    if (!(error instanceof ApprovalMessageRefusal)) throw error;
    return { kind: "refused", status: statusFor(error.code), code: error.code };
  }
}
