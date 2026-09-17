import { assistantApprovals } from "../assistant/approvals";
import { approvalResponse } from "./agent-approval-stream";
import type { TurnSeam } from "./agents-turn-seams";

/**
 * THE ASSISTANT'S APPROVAL CARDS, on the conversation requests that can strand
 * or spend one. Both are about a card the HOST owns, so neither may be answered
 * by the runtime the request is headed for. The message that MINTS a receipt is
 * the admission seam's (agents-turn-message.ts), which reads the same bytes it
 * decides the retry identity from.
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
