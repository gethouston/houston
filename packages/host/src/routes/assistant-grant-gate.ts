import type { ServerResponse } from "node:http";
import type { ForwardOutcome } from "./assistant-forward";
import type {
  AssistantCallInput,
  AssistantOperationCtx,
} from "./assistant-operation-ctx";
import { json } from "./http";

export function refusedForAnotherActor(
  ctx: AssistantOperationCtx,
  input: AssistantCallInput,
  res: ServerResponse,
): boolean {
  const held = input.requestId
    ? ctx.approvals.grants.held(input.requestId)
    : undefined;
  if (!held?.requiresActor || held.actor === input.actingAs) return false;
  json(res, 403, {
    error: `"${input.operation}" was approved by someone else, so it cannot run as this person`,
    code: "approval_required",
  });
  return true;
}

export function settleGrant(
  ctx: AssistantOperationCtx,
  input: AssistantCallInput,
  outcome: ForwardOutcome,
): void {
  if (input.requestId)
    ctx.approvals.grants.settle(
      input.requestId,
      input.operation,
      outcome === "refused",
    );
}
