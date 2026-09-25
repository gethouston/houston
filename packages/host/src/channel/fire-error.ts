/**
 * Typed non-2xx from the runtime's fire-turn POST, so callers branch on the
 * runtime's verdict instead of parsing a flat "runtime 409: {...}" string.
 * `code` is the runtime's machine-readable reason when its JSON body carried
 * one (e.g. "no_provider" from the 409 provider gate) — the scheduler uses it
 * to tell an expected user state apart from a real failure.
 */
export class TurnFireError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "TurnFireError";
  }
}

/**
 * The code a channel's fire carries when the agent's turn slot is taken: a
 * turn is already running, so nothing new started and nothing failed.
 */
export const TURN_BUSY_CODE = "turn_busy";

/**
 * A fire refused because the agent's one turn slot is taken. The slot is
 * agent-wide, so the refusal names the conversation whose turn holds it: a
 * caller asking "is MY turn the one running?" must not read another chat's
 * turn as its own.
 */
export class TurnBusyError extends TurnFireError {
  constructor(
    /** The conversation whose turn holds the slot; null when it is unknown. */
    readonly runningConversation: string | null,
  ) {
    super("a turn is already running for this agent", 409, TURN_BUSY_CODE);
    this.name = "TurnBusyError";
  }
}

/** The refusal a channel throws when its fire finds the turn slot taken. */
export function turnBusyError(
  runningConversation: string | null,
): TurnBusyError {
  return new TurnBusyError(runningConversation);
}

/** Whether a fire was refused because a turn is already running. */
export function isTurnBusy(err: unknown): boolean {
  return err instanceof TurnFireError && err.code === TURN_BUSY_CODE;
}

/** Whether a fire was refused because THIS conversation's turn is running. */
export function isTurnBusyIn(err: unknown, conversationId: string): boolean {
  return (
    err instanceof TurnBusyError && err.runningConversation === conversationId
  );
}

/** The `code` field of a runtime error body, when the body is JSON with one. */
export function errorCodeFrom(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      const code = (parsed as { code: unknown }).code;
      if (typeof code === "string" && code) return code;
    }
  } catch {
    // Not JSON — an HTML error page, a bare string. No code to extract; the
    // caller still gets the verbatim body in the error message.
  }
  return null;
}
