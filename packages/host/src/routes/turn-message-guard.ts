import type { ApprovalStore } from "../assistant/approvals";
import { readMessageAdmission } from "../assistant/message-admission-read";
import {
  ApprovalMessageRefusal,
  prepareMessageReceipts,
} from "../assistant/message-receipts";
import type { AgentId } from "../domain/types";
import type { Vfs } from "../vfs";
import { parseTurnBody } from "./turn-body";

export type TurnMessageGuard =
  | {
      kind: "admitted";
      body: Buffer;
      release?: () => void;
      duplicate: boolean;
    }
  | { kind: "refused"; status: 400 | 409 | 503; code: string };

function statusFor(code: ApprovalMessageRefusal["code"]): 400 | 409 | 503 {
  if (
    code === "invalid_nonce" ||
    code === "grants_not_allowed" ||
    code === "invalid_grants"
  )
    return 400;
  return code === "nonce_conflict" ? 409 : 503;
}

export async function guardTurnMessage(input: {
  approvals: ApprovalStore;
  vfs: Vfs | undefined;
  dataRoot: string;
  agentId: AgentId;
  conversationId: string;
  actor: string;
  grantActor?: string;
  body: Buffer;
}): Promise<TurnMessageGuard> {
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
      grantActor: input.grantActor,
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
    if (!(error instanceof ApprovalMessageRefusal)) throw error;
    return { kind: "refused", status: statusFor(error.code), code: error.code };
  }
}
