import { substituteApprovals } from "../assistant/approval-presentation";
import { assistantApprovals } from "../assistant/approvals";

export function hostOwnedApprovalCards(payload: unknown, agentId: string) {
  return substituteApprovals(payload, assistantApprovals, agentId);
}
