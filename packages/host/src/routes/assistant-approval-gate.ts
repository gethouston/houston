import type { ServerResponse } from "node:http";
import type {
  AssistantCallInput,
  AssistantOperationCtx,
} from "./assistant-operation-ctx";
import { json } from "./http";

/** Spend the receipt, or answer why this call is not going to happen. */
export function approved(
  ctx: AssistantOperationCtx,
  input: AssistantCallInput,
  params: Record<string, unknown>,
  res: ServerResponse,
): boolean {
  const outcome =
    input.requestId && ctx.conversationId
      ? ctx.approvals.consume({
          requestId: input.requestId,
          operation: input.operation,
          params,
          agentId: ctx.agentId,
          conversationId: ctx.conversationId,
        })
      : "none";
  if (outcome === "approved") return true;
  if (outcome === "denied") {
    json(res, 403, {
      error: `the user was shown exactly what "${input.operation}" would do and said no`,
      code: "approval_denied",
    });
    return false;
  }
  json(res, 403, {
    error: `"${input.operation}" changes something the user cannot easily get back, so only their own approval can start it`,
    code: "approval_required",
  });
  return false;
}
