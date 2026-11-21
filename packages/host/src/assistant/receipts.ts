import { parseMessageApprovals } from "@houston/protocol";
import type { AgentId } from "../domain/types";
import type { ApprovalStore } from "./approvals";

export interface ApplyReceiptsInput {
  approvals: ApprovalStore;
  agentId: AgentId;
  conversationId: string;
  field: unknown;
}

export function applyApprovalReceipts(input: ApplyReceiptsInput): number {
  const { approvals, agentId, conversationId } = input;
  const decided: string[] = [];
  for (const answer of parseMessageApprovals(input.field)) {
    const ok = approvals.decide({
      requestId: answer.requestId,
      agentId,
      conversationId,
      decision: answer.decision,
    });
    if (ok) decided.push(answer.requestId);
  }
  approvals.retireExcept(agentId, conversationId, decided);
  return decided.length;
}
