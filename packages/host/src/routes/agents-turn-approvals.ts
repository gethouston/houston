import { assistantApprovals } from "../assistant/approvals";
import { approvalResponse } from "./agent-approval-stream";
import type { TurnSeam } from "./agents-turn-seams";

export const clearDeletedApprovals: TurnSeam = (ctx) => {
  const deleted =
    ctx.method === "DELETE" ? ctx.rest.match(/^conversations\/([^/]+)$/) : null;
  if (deleted?.[1])
    assistantApprovals.clear(ctx.agent.id, decodeURIComponent(deleted[1]));
};

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
