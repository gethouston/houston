import { defineTool } from "@earendil-works/pi-coding-agent";
import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { findVisibleOperation } from "@houston/host/src/assistant/catalog";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { approvalCode, errorFromResponse } from "./assistant-call-errors";
import { refusedUnavailableHere } from "./assistant-callable";
import { declinedMessage, requestConfirmation } from "./assistant-confirm";
import { checkCallParams } from "./assistant-params";
import { refusedInPlanMode } from "./assistant-plan-gate";
import {
  type AssistantOperationResult,
  assistantErrorResult,
  assistantOkResult,
} from "./assistant-result";
import { retryComputeBusyOnce } from "./compute-busy-retry";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";

export const HOUSTON_CALL_TOOL_NAME = "houston_call";

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
        "Only for an operation the app already asked the user to approve: the requestId from that answer, repeated verbatim with the identical operation and params. Never invent one, and never send one you were not given - it authorizes nothing by itself.",
    }),
  ),
});
type CallParams = Static<typeof CallParams>;

export interface AssistantToolOptions {
  catalog: AssistantCatalog;
  call: SandboxFetch;
}

export function makeAssistantCallTool(opts: AssistantToolOptions) {
  return defineTool({
    name: HOUSTON_CALL_TOOL_NAME,
    label: "Do it in Houston",
    description:
      "Perform one Houston operation on the user's behalf - the same action they would take in the app themselves. Look the operation up with houston_capabilities, read its parameters with houston_describe, then call it here with the exact name and named arguments. Operations flagged confirm change or delete something the user cannot easily get back: call this normally and the app itself will show the user an approval card for that exact action - you do not approve anything. When the answer is ERROR needs_confirmation, END YOUR TURN and wait; after they approve, repeat the identical call adding the requestId you were given. Failures come back as ERROR with a named code instead of an exception - read it, fix the call if it was yours to fix, and otherwise explain the problem to the user without mentioning operations, parameters, or HTTP.",
    promptSnippet: "Perform a Houston operation",
    parameters: CallParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: CallParams,
      signal: AbortSignal | undefined,
    ): Promise<AssistantOperationResult> {
      const name = params.operation;
      const unavailable = refusedUnavailableHere(opts.catalog, name);
      if (unavailable) return unavailable;
      const op = findVisibleOperation(opts.catalog, name);
      if (!op) {
        return assistantErrorResult(name, {
          code: "unknown_operation",
          message: `There is no operation called "${name}". Search for the right one with houston_capabilities.`,
        });
      }
      if (!isCallableOperation(op)) {
        return assistantErrorResult(name, {
          code: "operation_not_supported",
          message: `${name} is not callable in this build: nothing here can perform it. Do not retry it - tell the user plainly that you cannot do that, and search houston_capabilities for something you can do instead.`,
        });
      }
      const checked = checkCallParams(op, params.params);
      if (!checked.ok) return assistantErrorResult(name, checked.error);
      const planned = refusedInPlanMode(op.route?.method ?? "GET", name);
      if (planned) return planned;
      const checkedOp = op;
      const callParams = checked.params;
      const acting = currentActingContext();
      const conversationId = currentConversationId();
      async function perform(
        requestId?: string,
      ): Promise<AssistantOperationResult> {
        let res: Response;
        try {
          res = await retryComputeBusyOnce(
            () =>
              opts.call(CALL_PATH, {
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
                  params: callParams,
                  ...(requestId ? { requestId } : {}),
                }),
                signal,
              }),
            signal,
          );
        } catch (err) {
          return assistantErrorResult(name, {
            code: "transport_error",
            message: `The app could not be reached to perform that: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        if (!res.ok) {
          const approval = await approvalCode(res.clone());
          if (approval === "approval_denied")
            return assistantErrorResult(name, {
              code: "confirmation_declined",
              message: declinedMessage(name),
            });
          if (approval === "approval_required") return confirm();
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
      }
      async function confirm(): Promise<AssistantOperationResult> {
        const outcome = await requestConfirmation(
          checkedOp,
          callParams,
          opts.call,
          signal,
        );
        return "preApproved" in outcome ? perform(outcome.requestId) : outcome;
      }
      return op.confirm && !params.requestId
        ? confirm()
        : perform(params.requestId);
    },
  });
}
