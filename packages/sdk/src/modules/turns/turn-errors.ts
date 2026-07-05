import { EngineError, FatalResumeError } from "@houston/runtime-client";

/**
 * Turn error classification — pure string helpers shared by the sink, settles,
 * and stream runners. Moved into the SDK with the turn machinery so the turn
 * dialect (what counts as "not connected" / "stopped by user" / the plain
 * message behind a rejected send) lives in exactly one place.
 */

/**
 * A turn that fails on the SEND (e.g. no provider connected → the runtime answers
 * 409) rejects with an EngineError wrapping the runtime's JSON body. Unwrap it to
 * the plain message the engine sent, so the chat shows "No provider connected. Log
 * in with Claude or Codex first." rather than a raw `engine request failed (409):
 * {…}` string (the product voice never shows status codes or JSON to the user).
 * A fatal stream refusal (FatalResumeError) unwraps to the EngineError it carries.
 */
export function turnErrorMessage(e: unknown): string {
  if (e instanceof FatalResumeError) e = e.cause;
  if (e instanceof EngineError) {
    try {
      const body = JSON.parse(e.body) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* body wasn't JSON — fall through to the generic message */
    }
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Whether a failed send is AMBIGUOUS about whether the engine received it.
 *
 * An {@link EngineError} is a server verdict (the engine answered — 409, 401,
 * …) and an abort is the caller's own cancellation: both are definitive.
 * Everything else is `fetch` reporting a transport failure (WebKit's
 * `TypeError: Load failed`, a reset, DNS…), which CANNOT distinguish "the
 * request never reached the engine" from "the engine accepted it but the
 * response was lost" — the turn may be running. Callers must not settle the
 * turn as failed on such an error without independent evidence (see
 * `streamTurn`'s send-verdict window).
 */
export function isAmbiguousSendFailure(e: unknown): boolean {
  if (e instanceof EngineError) return false;
  if (e instanceof Error && e.name === "AbortError") return false;
  return true;
}

/**
 * Whether a turn failure is the runtime's "no provider connected" refusal — the
 * verbatim message it raises when the chat's provider is logged out (runtime
 * `ai/providers.ts`, `transport/server.ts`, `turn/server.ts`; all prefixed
 * "No provider connected."). This is a HANDLED, recoverable state surfaced by
 * the in-chat reconnect card, not a turn failure, so the UI settles it cleanly
 * rather than rendering it as an error.
 */
export function isNotConnectedError(message: string): boolean {
  return message.toLowerCase().includes("no provider connected");
}

/**
 * Whether a turn's terminal error is the user pressing Stop — the verbatim
 * message the runtime (and the control plane's relay) emit on a cancel. This is
 * an intentional, handled stop, not a turn failure, so the UI shows the message
 * but settles the card back to the user (needs_you), never the red error state.
 */
export function isStoppedByUser(message: string): boolean {
  return message.includes("Stopped by user");
}
