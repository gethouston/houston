import { assistantApprovals } from "../assistant/approvals";
import { applyApprovalReceiptsToTurnBody } from "../assistant/receipts";
import { approvalResponse } from "./agent-approval-stream";
import type { TurnSeam } from "./agents-turn-seams";

/**
 * THE ASSISTANT'S APPROVAL CARDS, on the three conversation requests that can
 * mint, spend or strand one. All three are about a card the HOST owns, so none
 * of them may be answered by the runtime the request is headed for.
 */

/**
 * A deleted conversation takes its pending approvals with it: the card is gone
 * from the user's screen and there is no message left that could ever answer
 * it, so leaving the request live would let a stale id be spent.
 */
export const clearDeletedApprovals: TurnSeam = (ctx) => {
  const deleted =
    ctx.method === "DELETE" ? ctx.rest.match(/^conversations\/([^/]+)$/) : null;
  if (deleted?.[1])
    assistantApprovals.clear(ctx.agent.id, decodeURIComponent(deleted[1]));
};

/**
 * APPROVAL RECEIPTS (assistant/receipts.ts): a destructive Houston operation is
 * authorized by the person's OWN message, and this is the only seam it passes
 * through on its way to the runtime — so the yes is recorded here, where no
 * runtime can author one. The receipts ride the request's own `approvals`
 * field, which this strips before forwarding. Gated on a live card for this
 * exact agent + conversation, so an ordinary turn never even reads its body.
 */
export const applyApprovalReceipts: TurnSeam = async (ctx) => {
  const conversationId = ctx.turnConversationId;
  if (conversationId === undefined) return;
  if (!assistantApprovals.hasPending(ctx.agent.id, conversationId)) return;
  const stamped = applyApprovalReceiptsToTurnBody({
    approvals: assistantApprovals,
    agentId: ctx.agent.id,
    conversationId,
    body: await ctx.body.read(),
  });
  if (stamped) ctx.body.replace(stamped);
};

/**
 * The two reads that can carry a pending interaction (the stored history and
 * the live stream): the runtime's bytes reach the shell only through the host's
 * approval substitution.
 */
export const substituteApprovals: TurnSeam = (ctx) => {
  const read =
    ctx.method === "GET"
      ? ctx.rest.match(/^conversations\/([^/]+)\/(messages|events)$/)
      : null;
  if (read?.[1])
    ctx.client = approvalResponse(
      ctx.client,
      ctx.agent.id,
      decodeURIComponent(read[1]),
    );
};
