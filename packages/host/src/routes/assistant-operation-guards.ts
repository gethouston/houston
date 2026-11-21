import type { ServerResponse } from "node:http";
import { ASSISTANT_UNAVAILABLE_HERE } from "@houston/domain/assistant-deployment";
import type { AssistantOperation } from "../assistant/catalog";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { json } from "./http";
import { refusedOutsideExecuteTurn } from "./plan-gate";

export function refusedUnserved(
  ctx: AssistantOperationCtx,
  operation: string,
  res: ServerResponse,
): boolean {
  if (!ctx.unserved.has(operation)) return false;
  json(res, 400, {
    error: `"${operation}" is not something this app can do. Tell the user plainly that it is unavailable here, and do not retry it.`,
    code: ASSISTANT_UNAVAILABLE_HERE,
  });
  return true;
}

export function refusedUnknownParams(
  op: AssistantOperation,
  params: Record<string, unknown>,
  res: ServerResponse,
): boolean {
  const declared = new Set(op.params.map((param) => param.name));
  const unknown = Object.keys(params).filter((key) => !declared.has(key));
  if (unknown.length === 0) return false;
  const accepted = op.params.map((param) => param.name).join(", ");
  json(res, 400, {
    error: `"${op.name}" does not take ${JSON.stringify(unknown[0])}. It takes: ${accepted || "no arguments"}.`,
    code: "invalid_params",
  });
  return true;
}

export function refusedOutsideExecute(
  ctx: AssistantOperationCtx,
  op: AssistantOperation,
  res: ServerResponse,
): boolean {
  if (op.route?.method === "GET") return false;
  return refusedOutsideExecuteTurn(ctx.agentId, ctx.conversationId, res);
}
