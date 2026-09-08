import { randomBytes } from "node:crypto";
import { approvalKey } from "./approval-key";
import {
  APPROVAL_TTL_MS,
  type ApprovalDecision,
  type ApprovalOutcome,
  type ApprovalRequest,
  type ConsumeApprovalInput,
  type IssueApprovalInput,
} from "./approval-record";

/**
 * Where a destructive Houston operation's approval actually lives: in the HOST,
 * the process that holds the credential that would perform it.
 *
 * The rule: THE MODEL CANNOT MINT AN APPROVAL. The host issues a `requestId`
 * when it raises an approval card; the only thing that turns that id into a
 * usable receipt is the USER's own next message arriving on the host's
 * conversation-message route (`assistant/receipts.ts`), which no runtime
 * can author. The runtime's `houston_call` then presents the id back, and the
 * host — not the runtime — decides whether it may proceed.
 *
 * Every field of a record is a way for an approval to authorize the wrong thing,
 * so each one is checked at consume time:
 * - KEY: sha256 of the operation name plus its canonicalized arguments, so
 *   approving "delete Personal/Dobby" approves nothing else. It is recomputed
 *   from the params SUBMITTED with the call, so changed bytes are a new ask.
 * - REQUEST ID: 128 bits of randomness the model never sees until the host
 *   mints it, so an old reply cannot be replayed into a new grant.
 * - CONVERSATION + AGENT: approving in one chat authorizes nothing in another,
 *   and an unattended turn (a routine, fired straight at the runtime) never
 *   travels the message route at all, so it can never inherit one.
 * - SINGLE USE: {@link ApprovalStore.consume} removes the record it returns.
 * - SHORT LIVED: an approval the user gave and the model sat on is not an
 *   approval any more.
 *
 * Held in memory on purpose: a host restart drops every pending approval, which
 * fails CLOSED (the user is asked again). Persisting them would mean an
 * approval that outlives the conversation the person was looking at.
 */

export { approvalKey } from "./approval-key";
export {
  APPROVAL_TTL_MS,
  type ApprovalDecision,
  type ApprovalOutcome,
  type ApprovalRequest,
  type ConsumeApprovalInput,
  type IssueApprovalInput,
} from "./approval-record";

export class ApprovalStore {
  private readonly byId = new Map<string, ApprovalRequest>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Raise one approval card's request. The id is what the card carries back. */
  issue(input: IssueApprovalInput): ApprovalRequest {
    this.prune();
    const at = this.now();
    const request: ApprovalRequest = {
      requestId: randomBytes(16).toString("hex"),
      key: approvalKey(input.operation, input.params),
      operation: input.operation,
      agentId: input.agentId,
      conversationId: input.conversationId,
      summary: input.summary,
      ...(input.detail ? { detail: input.detail } : {}),
      createdAt: at,
      expiresAt: at + APPROVAL_TTL_MS,
    };
    this.byId.set(request.requestId, request);
    return request;
  }

  /**
   * Record the user's answer, arriving on their own message. Returns false — and
   * changes nothing — for an id this agent+conversation never raised, one that
   * expired, or one already answered: a receipt is written once, by the person
   * the card was in front of.
   */
  decide(input: {
    requestId: string;
    agentId: string;
    conversationId: string;
    decision: ApprovalDecision;
  }): boolean {
    this.prune();
    const request = this.byId.get(input.requestId);
    if (
      !request ||
      request.decision !== undefined ||
      request.agentId !== input.agentId ||
      request.conversationId !== input.conversationId
    )
      return false;
    request.decision = input.decision;
    return true;
  }

  /**
   * Drop every request for one conversation except the ids the arriving message
   * answered. A card the user walked away from — dismissed, cleared, edited out,
   * or simply replied past — is gone from their screen, so it must be gone from
   * here too: only the answer that came WITH this message survives to be spent
   * on the turn it starts.
   */
  retireExcept(agentId: string, conversationId: string, keep: string[]): void {
    const kept = new Set(keep);
    for (const [id, request] of this.byId) {
      if (request.agentId !== agentId) continue;
      if (request.conversationId !== conversationId) continue;
      if (kept.has(id)) continue;
      this.byId.delete(id);
    }
  }

  /**
   * Spend one receipt on one exact call. `"none"` covers every fail-closed case
   * at once — unknown id, still unanswered, expired, another conversation,
   * another agent, or arguments that no longer hash to what was approved.
   */
  consume(input: ConsumeApprovalInput): ApprovalOutcome {
    this.prune();
    const request = this.byId.get(input.requestId);
    if (!request || request.decision === undefined) return "none";
    if (
      request.agentId !== input.agentId ||
      request.conversationId !== input.conversationId ||
      request.operation !== input.operation ||
      request.key !== approvalKey(input.operation, input.params)
    )
      return "none";
    this.byId.delete(input.requestId);
    return request.decision === "approve" ? "approved" : "denied";
  }

  /** Forget one conversation's requests (it was deleted), or all of them. */
  clear(agentId?: string, conversationId?: string): void {
    if (agentId === undefined) return void this.byId.clear();
    for (const [id, request] of this.byId) {
      if (request.agentId !== agentId) continue;
      if (
        conversationId !== undefined &&
        request.conversationId !== conversationId
      )
        continue;
      this.byId.delete(id);
    }
  }

  /** True while any card is still in front of someone in this conversation. */
  hasPending(agentId: string, conversationId: string): boolean {
    this.prune();
    for (const request of this.byId.values()) {
      if (
        request.agentId === agentId &&
        request.conversationId === conversationId
      )
        return true;
    }
    return false;
  }

  /** An expired record is already useless, and the map is unbounded otherwise. */
  private prune(): void {
    const at = this.now();
    for (const [id, request] of this.byId) {
      if (request.expiresAt <= at) this.byId.delete(id);
    }
  }
}

/** The one store this host process approves against. */
export const assistantApprovals = new ApprovalStore();
