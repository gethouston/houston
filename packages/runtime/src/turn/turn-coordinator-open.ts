import { ApprovalMessageRefusal } from "@houston/host/src/assistant/message-receipts";
import { openTurnApprovals, type TurnApprovals } from "./turn-approvals";
import type { TurnCoordinatorInput } from "./turn-coordinator";
import { receiveTurnMessage } from "./turn-coordinator-message";

export type CoordinatorAdmission =
  | { kind: "admitted"; approvals: TurnApprovals }
  | { kind: "refused"; code: ApprovalMessageRefusal["code"] }
  | { kind: "unavailable" };

export async function admitCoordinatorTurn(
  input: TurnCoordinatorInput,
  agentId: string,
): Promise<CoordinatorAdmission> {
  try {
    const approvals = await openTurnApprovals(
      {
        store: input.store,
        prefix: input.prefix,
        filesystem: input.filesystem,
        agentId,
        conversationId: input.turn.conversationId,
      },
      (store, admitted, damaged) =>
        receiveTurnMessage(store, admitted, agentId, input.turn, damaged),
    );
    return { kind: "admitted", approvals };
  } catch (error) {
    if (error instanceof ApprovalMessageRefusal)
      return { kind: "refused", code: error.code };
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : "error";
    console.error(`[turn-coordinator] approvals unavailable (${detail})`);
    return { kind: "unavailable" };
  }
}
