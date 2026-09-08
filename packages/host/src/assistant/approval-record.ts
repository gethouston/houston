/**
 * WHAT an approval is, apart from the store that holds them (`approvals.ts`).
 *
 * Every field here is a way for one approval to authorize the wrong thing, so
 * each is checked at consume time — see the store's own header for the rule
 * each one keeps.
 */

/** How long a request — and the receipt it becomes — stays usable. */
export const APPROVAL_TTL_MS = 10 * 60_000;

export type ApprovalDecision = "approve" | "deny";

/** What the host issued, and what the user later said about it. */
export interface ApprovalRequest {
  requestId: string;
  /** {@link approvalKey} of the exact call this decides. */
  key: string;
  operation: string;
  agentId: string;
  conversationId: string;
  /** The plain-language sentence the card shows. Returned to the runtime so the
   *  card and the receipt can never describe two different things. */
  summary: string;
  /** The verbatim arguments too long to sit in {@link summary}, shown under it
   *  on the card. Absent when everything fit in the sentence. */
  detail?: string;
  createdAt: number;
  expiresAt: number;
  /** Set once the user answered. Undefined while the card is still in front
   *  of them. */
  decision?: ApprovalDecision;
}

/** What consuming a receipt says about one exact call. */
export type ApprovalOutcome = "approved" | "denied" | "none";

export interface IssueApprovalInput {
  operation: string;
  params: Record<string, unknown>;
  agentId: string;
  conversationId: string;
  summary: string;
  detail?: string;
}

export interface ConsumeApprovalInput {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
  agentId: string;
  conversationId: string;
}
