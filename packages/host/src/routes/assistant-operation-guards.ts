import type { ServerResponse } from "node:http";
import { ASSISTANT_UNAVAILABLE_HERE } from "@houston/domain/assistant-deployment";
import type { AssistantOperation } from "../assistant/catalog";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { json } from "./http";
import { refusedOutsideExecuteTurn } from "./plan-gate";

/**
 * The checks every `/sandbox/assistant/*` handler runs BEFORE it touches a
 * call's arguments: can this deployment perform the operation at all, is the
 * call allowed to happen right now, and are its arguments the ones the
 * operation declares. Each answers the refusal itself so the card, the receipt
 * and the request are never built from anything else.
 */

/**
 * An operation the catalog names but THIS deployment cannot perform — spaces,
 * teams, billing and the hosted profile on a desktop
 * (`assistant/served-operations.ts`).
 *
 * Refused here with its own code so the model hears ONE plain, final answer.
 * Without it the request is built, the address misses every handler, and
 * `assistant-forward.ts` relays the 404 as `gateway_error` — which reads to
 * the model as an outage worth retrying and to the user as Houston breaking.
 */
export function refusedUnserved(
  ctx: AssistantOperationCtx,
  operation: string,
  res: ServerResponse,
): boolean {
  if (!ctx.unserved.has(operation)) return false;
  json(res, 400, {
    error: `"${operation}" is not something this Houston can do. Tell the user plainly that it is unavailable here, and do not retry it.`,
    code: ASSISTANT_UNAVAILABLE_HERE,
  });
  return true;
}

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
