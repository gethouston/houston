import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { findVisibleOperation } from "@houston/host/src/assistant/catalog";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { currentTurnMode } from "../turn-mode-context";
import { approvalCode, errorFromResponse } from "./assistant-call-errors";
import { isCallableOperation } from "./assistant-callable";
import { declinedMessage, requestConfirmation } from "./assistant-confirm";
import { checkCallParams } from "./assistant-params";
import {
  type AssistantOperationResult,
  assistantErrorResult,
  assistantOkResult,
} from "./assistant-result";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";

/**
 * `houston_call` — the one tool that PERFORMS a catalogued Houston operation.
 *
 * It holds no credential and it holds no approval: it carries only the
 * per-sandbox HMAC token to the host's `/sandbox/assistant/call`, and the host
 * is what knows the gateway URL, the gateway token, which operations it will
 * actually route, and whether the USER approved this exact call. Validation is
 * duplicated on purpose — here so the model gets a correctable answer, there so
 * a sandbox token alone can never reach an unrouted or unapproved operation.
 *
 * `confirm: true` operations go through `assistant-confirm.ts` first, which asks
 * the HOST to raise the card and hands back the `requestId` the model presents
 * on its next call. There is deliberately NO "confirmed" input: an approval the
 * model could assert is not an approval, and a `requestId` is worthless until
 * the user's own reply turns it into a receipt in the host.
 */

export const HOUSTON_CALL_TOOL_NAME = "houston_call";

/** The host route the tool proxies through. */
const CALL_PATH = "/sandbox/assistant/call";

const CallParams = Type.Object({
  operation: Type.String({
    description:
      "The exact operation name from houston_capabilities or houston_describe. Never invent one.",
  }),
  params: Type.Record(Type.String(), Type.Unknown(), {
    description:
      "The operation's arguments, keyed by parameter name exactly as houston_describe lists them. Pass {} when it takes none.",
  }),
  requestId: Type.Optional(
    Type.String({
      description:
        "Only for an operation Houston already asked the user to approve: the requestId from that answer, repeated verbatim with the identical operation and params. Never invent one, and never send one you were not given - it authorizes nothing by itself.",
    }),
  ),
});
type CallParams = Static<typeof CallParams>;

export interface AssistantToolOptions {
  /** The loaded operation catalog (absent catalog = no assistant family). */
  catalog: AssistantCatalog;
  call: SandboxFetch;
}

export function makeAssistantCallTool(opts: AssistantToolOptions) {
  return defineTool({
    name: HOUSTON_CALL_TOOL_NAME,
    label: "Do it in Houston",
    description:
      "Perform one Houston operation on the user's behalf - the same action they would take in the app themselves. Look the operation up with houston_capabilities, read its parameters with houston_describe, then call it here with the exact name and named arguments. Operations flagged confirm change or delete something the user cannot easily get back: call this normally and Houston itself will show the user an approval card for that exact action - you do not approve anything. When the answer is ERROR needs_confirmation, END YOUR TURN and wait; after they approve, repeat the identical call adding the requestId you were given. Failures come back as ERROR with a named code instead of an exception - read it, fix the call if it was yours to fix, and otherwise explain the problem to the user without mentioning operations, parameters, or HTTP.",
    promptSnippet: "Perform a Houston operation",
    parameters: CallParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: CallParams,
      signal: AbortSignal | undefined,
    ): Promise<AssistantOperationResult> {
      const name = params.operation;
      const op = findVisibleOperation(opts.catalog, name);
      if (!op) {
        return assistantErrorResult(name, {
          code: "unknown_operation",
          message: `There is no operation called "${name}". Search for the right one with houston_capabilities.`,
        });
      }
      // Unroutable operations are absent from houston_capabilities, so reaching
      // one means the model addressed it from memory. The host would refuse it
      // anyway; refusing here names the reason instead of spending a round trip.
      if (!isCallableOperation(op)) {
        return assistantErrorResult(name, {
          code: "operation_not_supported",
          message: `${name} is not callable in this build: nothing here can perform it. Do not retry it - tell the user plainly that you cannot do that, and search houston_capabilities for something you can do instead.`,
        });
      }
      const checked = checkCallParams(op, params.params);
      if (!checked.ok) return assistantErrorResult(name, checked.error);
      // The user may switch this conversation to Plan mode WHILE the turn runs
      // (Claude Code's shift+tab). The session's toolset is already built, so
      // the LIVE mode is read here, at the moment the call would change
      // something — a read stays allowed, everything else stops.
      const planned = refusedInPlanMode(op.route?.method ?? "GET", name);
      if (planned) return planned;
      // The confirmation gate. It runs on the CHECKED params, so the approval
      // the user is asked for is bound to the bytes that would actually be sent.
      if (op.confirm && !params.requestId)
        return requestConfirmation(op, checked.params, opts.call, signal);

      const acting = currentActingContext();
      const conversationId = currentConversationId();
      let res: Response;
      try {
        res = await opts.call(CALL_PATH, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(conversationId
              ? { [CONVERSATION_ID_HEADER]: conversationId }
              : {}),
            ...(acting?.actingAs
              ? { "x-houston-acting-as": acting.actingAs }
              : {}),
            ...(acting?.actingUser
              ? { "x-houston-acting-user": acting.actingUser }
              : {}),
          },
          body: JSON.stringify({
            operation: name,
            params: checked.params,
            ...(params.requestId ? { requestId: params.requestId } : {}),
          }),
          signal,
        });
      } catch (err) {
        return assistantErrorResult(name, {
          code: "transport_error",
          message: `Houston could not be reached to perform that: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      if (!res.ok) {
        const approval = await approvalCode(res.clone());
        if (approval === "approval_denied")
          return assistantErrorResult(name, {
            code: "confirmation_declined",
            message: declinedMessage(name),
          });
        // The receipt is missing, spent, expired, or was minted for different
        // arguments. Ask again rather than dead-end: the host raises a fresh
        // card and the model waits, exactly as on a first ask.
        if (approval === "approval_required")
          return requestConfirmation(op, checked.params, opts.call, signal);
        return assistantErrorResult(name, await errorFromResponse(res));
      }
      try {
        const text = await res.text();
        return assistantOkResult(name, text ? JSON.parse(text) : null);
      } catch (err) {
        return assistantErrorResult(name, {
          code: "transport_error",
          status: res.status,
          message: `The operation answered something unreadable: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  });
}

/**
 * The live Plan-mode gate. Reads the mode at call time (see
 * `live-mode-gate.ts`), so a switch made while the agent works stops the very
 * next mutation. Reported as a RESULT, not a throw, because that is this tool's
 * whole contract: the model must be able to tell a refusal from a crash.
 */
function refusedInPlanMode(
  method: string,
  name: string,
): AssistantOperationResult | undefined {
  if (method === "GET" || currentTurnMode() !== "plan") return undefined;
  return assistantErrorResult(name, {
    code: "operation_not_supported",
    message: `The user just switched this conversation to Plan mode, so you can no longer change anything in Houston. ${name} was NOT performed. Stop acting now: summarize what you already did, then lay out the remaining work as a clear step-by-step plan in plain language for the user to approve, and end your turn.`,
  });
}
