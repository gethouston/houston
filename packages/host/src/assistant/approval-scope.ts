import { approvalKey } from "./approval-key";
import type { ApprovalRequest, ConsumeApprovalInput } from "./approval-record";

export function inApprovalScope(
  request: ApprovalRequest,
  agentId: string,
  conversationId?: string,
): boolean {
  return (
    request.agentId === agentId &&
    (conversationId === undefined || request.conversationId === conversationId)
  );
}

export function authorizesApprovalCall(
  request: ApprovalRequest,
  input: ConsumeApprovalInput,
): boolean {
  return (
    inApprovalScope(request, input.agentId, input.conversationId) &&
    request.operation === input.operation &&
    request.key === approvalKey(input.operation, input.params)
  );
}
