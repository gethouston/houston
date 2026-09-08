import { substituteApprovals } from "../assistant/approval-presentation";
import { assistantApprovals } from "../assistant/approvals";

/**
 * The board's half of the approval rule (assistant/approvals.ts): an activity
 * row's `pending_interaction` is written to `activity.json`, a file the agent's
 * own file tools can edit, so a runtime can stamp a mission card with prose of
 * its choosing next to a LIVE `requestId` and the person would be clicking
 * approve on a card that describes something else entirely.
 *
 * So the board is served the same way a conversation read is
 * (routes/agent-approval-stream.ts): every question step carrying a requestId
 * is re-rendered from the HOST's record, and a requestId with no live record
 * for this agent is stripped — leaving an ordinary question the model may ask,
 * but never a receipt it could spend.
 *
 * There is no conversation to scope by here: the card lives on a mission row.
 * The record must still be this agent's, and the receipt itself is bound to the
 * conversation it was raised in when it is finally consumed.
 */
export function hostOwnedApprovalCards(payload: unknown, agentId: string) {
  return substituteApprovals(payload, assistantApprovals, agentId);
}
