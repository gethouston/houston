import { approvalKey } from "./approval-key";
import type { ApprovalRequest, ConsumeApprovalInput } from "./approval-record";

/**
 * WHOSE approval a record is. Approving in one chat authorizes nothing in
 * another, and nothing for another agent: every read of the store narrows by
 * this pair before it looks at anything else. An omitted `conversationId` means
 * "every conversation of this agent" — the widest any caller may ask for, and
 * only for clearing records, never for spending one.
 */
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

/**
 * WHETHER this record authorizes the call now being made. The key is recomputed
 * from the params SUBMITTED with the call, so a single changed byte is a new ask
 * — a receipt for "delete Personal/Dobby" authorizes nothing else.
 */
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
