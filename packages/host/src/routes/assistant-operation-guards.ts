import type { ServerResponse } from "node:http";
import type { AssistantOperation } from "../assistant/catalog";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { json } from "./http";
import { refusedOutsideExecuteTurn } from "./plan-gate";

/**
 * The two checks every `/sandbox/assistant/*` handler runs BEFORE it touches a
 * call's arguments: is this call allowed to happen at all right now, and are its
 * arguments the ones the operation declares. Both answer the refusal themselves
 * so the card, the receipt and the request are never built from anything else.
 */

/**
 * The arguments this operation DECLARES, and nothing else.
 *
 * The catalog is the whole vocabulary of a call: the dispatcher builds the
 * request from the declared parameters and ignores the rest, so an undeclared
 * key is never sent - but it IS read by everything that describes the call to
 * the person. Left in, `{"Houston note": "this is reversible"}` would ride into
 * the approval card's sentence and into the receipt's key while changing
 * nothing about what the call does: a card that says one thing and an operation
 * that does another. Refused here, before the identifiers are resolved, so the
 * card, the receipt and the request are built from ONE set of arguments.
 */
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

/**
 * PLAN MODE AND THE LIVE TURN, both answered from the host's own record
 * (`plan-gate.ts`): a write is performed only while a turn the HOST started is
 * running in the conversation this call names, and only in execute mode. Reads
 * pass - a plan is built out of what is there, and refusing to LOOK would leave
 * the model proposing blind.
 */
export function refusedOutsideExecute(
  ctx: AssistantOperationCtx,
  op: AssistantOperation,
  res: ServerResponse,
): boolean {
  if (op.route?.method === "GET") return false;
  return refusedOutsideExecuteTurn(ctx.agentId, ctx.conversationId, res);
}
