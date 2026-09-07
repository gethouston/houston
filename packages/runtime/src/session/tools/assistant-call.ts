import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { findVisibleOperation } from "@houston/host/src/assistant/catalog";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { isCallableOperation } from "./assistant-callable";
import { checkCallParams } from "./assistant-params";
import {
  type AssistantError,
  type AssistantOperationResult,
  assistantErrorResult,
  assistantOkResult,
} from "./assistant-result";
import type { SandboxFetch } from "./sandbox-fetch";

/**
 * `houston_call` — the one tool that PERFORMS a catalogued Houston operation.
 *
 * It holds no credential: it carries only the per-sandbox HMAC token to the
 * host's `/sandbox/assistant/call`, and the host is what knows the gateway URL,
 * the gateway token, and which operations it will actually route. Validation is
 * duplicated on purpose — here so the model gets a correctable answer, there so
 * a sandbox token alone can never reach an unrouted operation.
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
  confirmed: Type.Optional(
    Type.Boolean({
      description:
        "Set true ONLY after the user has, in this conversation and in this turn, explicitly approved THIS specific action on THIS specific target. Operations marked confirm are destructive or hard to reverse and are refused without it. Never set it because the user approved something similar earlier, because the action seems obviously wanted, or to retry a refusal - ask them first, in plain words, and wait for their answer.",
    }),
  ),
});
type CallParams = Static<typeof CallParams>;

export interface AssistantToolOptions {
  /** The loaded operation catalog (absent catalog = no assistant family). */
  catalog: AssistantCatalog;
  call: SandboxFetch;
}

/** Read the host's error body, preferring its named `code` over the status. */
async function errorFromResponse(res: Response): Promise<AssistantError> {
  const text = await res.text().catch(() => "");
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null) {
      const fields = body as { code?: unknown; error?: unknown };
      if (typeof fields.code === "string") code = fields.code;
      if (typeof fields.error === "string") message = fields.error;
    }
  } catch {
    // A non-JSON body (a proxy's HTML error page) still carries the status.
  }
  const detail = message ?? text.slice(0, 300);
  if (code === "operation_not_supported") {
    return {
      code: "operation_not_supported",
      status: res.status,
      message: `This Houston install cannot perform that operation yet. Tell the user plainly and offer what you can do instead. (${detail})`,
    };
  }
  return {
    code: "gateway_error",
    status: res.status,
    message: `The operation was refused (HTTP ${res.status})${detail ? `: ${detail}` : ""}.`,
  };
}

export function makeAssistantCallTool(opts: AssistantToolOptions) {
  return defineTool({
    name: HOUSTON_CALL_TOOL_NAME,
    label: "Do it in Houston",
    description:
      "Perform one Houston operation on the user's behalf - the same action they would take in the app themselves. Look the operation up with houston_capabilities, read its parameters with houston_describe, then call it here with the exact name and named arguments. Operations flagged confirm change or delete something the user cannot easily get back: describe exactly what will happen, ask them in plain words, wait for their answer, and only then repeat the call with confirmed true. Failures come back as ERROR with a named code instead of an exception - read it, fix the call if it was yours to fix, and otherwise explain the problem to the user without mentioning operations, parameters, or HTTP.",
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
      if (op.confirm && params.confirmed !== true) {
        return assistantErrorResult(name, {
          code: "confirmation_required",
          message: `${name} changes something the user cannot easily undo. Tell them exactly what it will do, ask whether to go ahead, and only repeat this call with confirmed true once they have said yes.`,
        });
      }

      const acting = currentActingContext();
      let res: Response;
      try {
        res = await opts.call(CALL_PATH, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(acting?.actingAs
              ? { "x-houston-acting-as": acting.actingAs }
              : {}),
            ...(acting?.actingUser
              ? { "x-houston-acting-user": acting.actingUser }
              : {}),
          },
          body: JSON.stringify({ operation: name, params: checked.params }),
          signal,
        });
      } catch (err) {
        return assistantErrorResult(name, {
          code: "transport_error",
          message: `Houston could not be reached to perform that: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      if (!res.ok) {
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
