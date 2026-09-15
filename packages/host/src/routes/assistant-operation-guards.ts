import type { ServerResponse } from "node:http";
import { recordConversationKind } from "@houston/domain";
import { ASSISTANT_UNAVAILABLE_HERE } from "@houston/domain/assistant-deployment";
import type { AssistantOperation } from "../assistant/catalog";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { arg } from "./assistant-request-parts";
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

/** The one refusal a caller gets for a chat that is not its to change. Named on
 *  the runtime's side too (`session/tools/assistant-result.ts`), so the model
 *  hears a final state instead of a gateway error worth retrying. */
export const PROTECTED_CONVERSATION = "protected_conversation";

/** The read every chat-naming parameter declares as where its value comes from
 *  (`ui/engine-client/scripts/assistant-entity-rules.ts`). */
const CHAT_ID_SOURCE = "conversations.list";

/**
 * The parameter a route addresses THE CHAT ITSELF by: a chat id that is the
 * last thing in the path, which is the shape of an operation acting on the
 * chat's own existence or name. `…/conversations/{conversationId}/cancel` also
 * names a chat, but acts on what is happening inside one — stopping a mission's
 * turn is a thing the assistant must keep being able to do.
 */
export function chatAddressedItself(op: AssistantOperation): string | null {
  const chat = op.params.find((param) => param.source === CHAT_ID_SOURCE);
  if (!chat || !op.route) return null;
  return op.route.path.endsWith(`{${chat.name}}`) ? chat.name : null;
}

/** Why this chat may not be renamed or deleted from here, when it may not. */
function protectedChat(
  id: string,
  conversationId: string | undefined,
): string | null {
  if (id === conversationId) {
    return "that is the chat you are talking in, so it cannot be renamed or deleted from inside itself - doing it would end this conversation mid-answer. Tell the user they can do it themselves from their list of chats.";
  }
  const kind = recordConversationKind(id);
  if (kind === "mission") {
    return "that chat belongs to a mission's card, not to the user's list of chats. Rename the mission with renameMission and remove it with deleteActivity, which take the card and its chat together - and tell the user the mission is what they are changing.";
  }
  if (kind === "routine") {
    return "that chat belongs to a routine's runs, not to the user's list of chats. Change the routine itself with updateRoutine or deleteRoutine, and tell the user the routine is what they are changing.";
  }
  return null;
}

/**
 * THE CHAT THIS TURN IS RUNNING IN, and the chats a card owns.
 *
 * Deleting the conversation the assistant is speaking in disposes the live
 * session mid-turn: the user watches the answer they are waiting for vanish,
 * along with everything they said to get it. A mission's or a routine's
 * transcript is the same mistake one step out — the chat is the card's, and
 * removing or retitling it from here leaves the card pointing at nothing, with
 * no screen anywhere that would let the person undo it.
 *
 * Refused with the sentence the model repeats to the user, exactly as the board
 * refuses a move of the mission its own conversation belongs to
 * (`routes/missions-manage.ts`). Reads are untouched: the assistant must be
 * able to look at any of these to talk about them.
 */
export function refusedProtectedChat(
  ctx: AssistantOperationCtx,
  op: AssistantOperation,
  params: Record<string, unknown>,
  res: ServerResponse,
): boolean {
  if (op.route?.method === "GET") return false;
  const name = chatAddressedItself(op);
  if (name === null) return false;
  const id = arg(params, name);
  if (typeof id !== "string") return false;
  const refusal = protectedChat(id, ctx.conversationId);
  if (refusal === null) return false;
  json(res, 409, { error: refusal, code: PROTECTED_CONVERSATION });
  return true;
}
