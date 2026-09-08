import { parseMessageApprovals } from "@houston/protocol";
import type { AgentId } from "../domain/types";
import type { ApprovalStore } from "./approvals";

/**
 * WHERE a person's yes becomes a receipt: on their own message, as it passes
 * through the host on its way to the runtime.
 *
 * This is the whole reason the lock lives in the host. A runtime cannot author a
 * user message — assistant text never travels this route, and an unattended turn
 * (a routine) is fired straight at the runtime, bypassing it entirely — so a
 * receipt written here is one a person actually clicked for.
 *
 * Two things happen, in this order:
 * 1. Every approval the message carries is recorded against the request it
 *    names, if that request is still live for THIS agent and conversation.
 * 2. Every OTHER request for the conversation is retired. A card the user
 *    walked away from (dismissed, `/clear`ed, edited out, or simply replied
 *    past) is gone from their screen, so it must be gone from here: only the
 *    answer that arrived WITH this message survives, to be spent on the turn it
 *    starts.
 *
 * The receipts ride their OWN request field (`approvals`) and never travel
 * further than this seam: the field is dropped before the request continues, so
 * the runtime, the model and the transcript only ever see what the person
 * actually wrote.
 */

export interface ApplyReceiptsInput {
  approvals: ApprovalStore;
  agentId: AgentId;
  conversationId: string;
  /** The request's `approvals` field, exactly as it arrived. */
  field: unknown;
}

/** How many receipts this message actually minted (0 for ordinary text). */
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

/**
 * The same rule applied to a drained turn body: record what it carries, then
 * return the body to forward WITHOUT the `approvals` field. Returns null when
 * there was nothing to do — the normal case for every agent that is not the
 * assistant and every conversation with no card in front of the user, so the
 * hot turn path pays a map lookup and nothing else.
 *
 * A body that is not the JSON this route speaks is left entirely alone: deciding
 * what to tell the client about it belongs to the channel this request is headed
 * for, which already answers it.
 */
export function applyApprovalReceiptsToTurnBody(input: {
  approvals: ApprovalStore;
  agentId: AgentId;
  conversationId: string;
  body: Buffer;
}): Buffer | null {
  if (!input.approvals.hasPending(input.agentId, input.conversationId))
    return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.body.toString("utf8") || "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  applyApprovalReceipts({
    approvals: input.approvals,
    agentId: input.agentId,
    conversationId: input.conversationId,
    field: parsed.approvals,
  });
  if (!("approvals" in parsed)) return null;
  const { approvals: _receipts, ...forwarded } = parsed;
  return Buffer.from(JSON.stringify(forwarded), "utf8");
}
