import type { ServerResponse } from "node:http";
import type {
  AssistantCallInput,
  AssistantOperationCtx,
} from "./assistant-operation-ctx";
import { json } from "./http";

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

export async function persisted(
  ctx: AssistantOperationCtx,
  res: ServerResponse,
): Promise<boolean> {
  if (!ctx.persistApprovals) return true;
  try {
    await ctx.persistApprovals();
    return true;
  } catch (error) {
    console.error(
      "[assistant] the spent approval could not be recorded",
      error,
    );
    json(res, 503, {
      error:
        "the approval could not be recorded, so nothing was done: ask the user to approve again",
      code: "approval_unavailable",
    });
    return false;
  }
}
