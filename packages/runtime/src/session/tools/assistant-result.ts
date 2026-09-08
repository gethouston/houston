import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

/**
 * The assistant family's failure taxonomy and the tool results it is reported in.
 *
 * `houston_call` is a generic dispatcher over hundreds of operations, so the
 * model must be able to tell "I addressed this wrong" (fix the call) from "the
 * user has to decide" (ask) from "the server refused" (report it). A raw thrown
 * exception collapses all three into one opaque string, so every failure comes
 * back as a RESULT carrying a named code instead.
 */

export type AssistantErrorCode =
  /** No such operation, or it is withheld from the agent. */
  | "unknown_operation"
  /** A param the operation does not take. */
  | "unknown_param"
  /** A required param was omitted. */
  | "missing_param"
  /** A param was present but failed the catalog's schema for it. */
  | "invalid_param"
  /** `params` was not an object of param values. */
  | "invalid_params"
  /** The operation is `confirm: true` and no approval from the user exists for
   *  this exact call. Houston is showing them the approval card. */
  | "needs_confirmation"
  /** The user was shown the approval card for this exact call and said no. */
  | "confirmation_declined"
  /** Nothing in this build can perform it: no route in the catalog, or the host refused. */
  | "operation_not_supported"
  /** The chat is in Plan mode, so the host performed nothing. The user asked
   *  for a proposal; only they can move the turn to Execute. */
  | "plan_mode"
  /** The host has no live turn recorded for this agent and conversation, so it
   *  performed nothing. The correction is to act inside a turn, never to retry
   *  the same call. */
  | "not_in_turn"
  /** The gateway answered a 4xx/5xx. */
  | "gateway_error"
  /** The host could not be reached, or answered something unreadable. */
  | "transport_error";

export interface AssistantError {
  code: AssistantErrorCode;
  message: string;
  /** The upstream HTTP status, when the failure came from a response. */
  status?: number;
}

/** What the user is being asked to approve, alongside a `needs_confirmation`
 *  refusal: the plain-language sentence on their card and the exact arguments
 *  the approval will be bound to. Structured so the model can restate the ask
 *  without re-deriving it — never so it can act on it. */
export interface AssistantConfirmationRequest {
  summary: string;
  params: Record<string, unknown>;
  /** The HOST-issued id of the approval card now in front of the user. The
   *  model presents it back on its next `houston_call` for this same call; the
   *  host matches it against the receipt the user's own reply minted. It
   *  authorizes nothing on its own. */
  requestId: string;
}

/**
 * What every operation-addressed tool (`houston_describe`, `houston_call`)
 * hands back. A UNION rather than an `ok: boolean` with an optional error, so
 * the failure path cannot compile without its code.
 */
export type AssistantOperationDetails =
  | { ok: true; operation: string }
  | {
      ok: false;
      operation: string;
      error: AssistantError;
      /** Set only on `needs_confirmation`: the ask now in front of the user. */
      confirmation?: AssistantConfirmationRequest;
    };

export type AssistantOperationResult =
  AgentToolResult<AssistantOperationDetails>;

/**
 * A failure, reported as a result rather than a throw. The text leads with
 * `ERROR` so a model skimming the transcript cannot read a refusal as a
 * success, and carries the machine-readable code so it can react to the
 * specific cause.
 */
export function assistantErrorResult(
  operation: string,
  error: AssistantError,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text: `ERROR ${error.code}: ${error.message}` }],
    details: { ok: false, operation, error },
  };
}

/**
 * The refusal that raises a real approval card: the operation is destructive
 * and no approval for THIS exact call exists. Carries the ask in structured
 * form so the model can wait on it intelligently instead of guessing.
 */
export function assistantNeedsConfirmationResult(
  operation: string,
  message: string,
  confirmation: AssistantConfirmationRequest,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text: `ERROR needs_confirmation: ${message}` }],
    details: {
      ok: false,
      operation,
      error: { code: "needs_confirmation", message },
      confirmation,
    },
  };
}

/** A success carrying the operation's JSON payload verbatim (`null` when empty). */
export function assistantOkResult(
  operation: string,
  payload: unknown,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload ?? null) }],
    details: { ok: true, operation },
  };
}

/** A success carrying already-composed text (what `houston_describe` answers). */
export function assistantTextResult(
  operation: string,
  text: string,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text }],
    details: { ok: true, operation },
  };
}
