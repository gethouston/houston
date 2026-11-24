export { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";

import { refusalCode, refusalStatus } from "@houston/sdk/refusal-code";

export type BridgeState =
  | "model_unavailable"
  | "revoked"
  | "authorization_required"
  | "reconnect_required"
  | "reconnecting";

export class BridgeStateError extends Error {
  readonly status: BridgeState;
  constructor(status: BridgeState) {
    super(status);
    this.name = "BridgeStateError";
    this.status = status;
  }
}
export function isAuthorizationFailure(error: unknown) {
  if (error instanceof BridgeStateError)
    return (
      error.status === "authorization_required" || error.status === "revoked"
    );
  if (typeof error !== "object" || error === null) return false;
  return (
    ("status" in error && (error.status === 401 || error.status === 403)) ||
    ("code" in error &&
      [
        "unauthorized",
        "forbidden",
        "revoked",
        "not_owner",
        "not_member",
      ].includes(String(error.code)))
  );
}

/**
 * The gateway refused to register a connection for good: a 403 (the agent's
 * model ceiling, the person's role, the agent gone) or a request it will never
 * accept (400/422). Nothing was registered under the journal's key, so the SDK
 * forgets the attempt; kept, it was re-registered and refused again on every
 * boot, and the retirement every later connect or disconnect runs first was
 * refused the same way, so the agent's local model could never change.
 * A 401 is a lost session, never this.
 */
export function isRegistrationRefusal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error))
    return false;
  return [400, 403, 422].includes(Number(error.status));
}

/**
 * A refused registration the SDK already forgot (see
 * {@link isRegistrationRefusal}): nothing is connected, so the bridge settles
 * disabled rather than asking the person to sign in. Keeps the gateway's
 * status and body so the report still carries its cause. Erasable syntax only
 * (see {@link BridgeStateError}).
 */
export class BridgeRegistrationRefusedError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(refusal: unknown) {
    const detail = refusal instanceof Error ? refusal.message : String(refusal);
    super(`bridge registration refused: ${detail}`, { cause: refusal });
    this.name = "BridgeRegistrationRefusedError";
    const { status, body } = refusal as { status?: unknown; body?: unknown };
    this.status = Number(status);
    this.body = body;
  }
}

export function isPermanentBridgeFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error))
    return false;
  return [400, 404, 409, 410, 422].includes(Number(error.status));
}

/**
 * An explicit operation (connect, resume, disconnect, ...) asked of a
 * controller the binding already superseded: the person switched space, agent
 * or account, and the next controller owns the bridge. Erasable syntax only
 * (see {@link BridgeStateError}).
 */
export class BridgeDisposedError extends Error {
  constructor() {
    super("bridge controller disposed");
    this.name = "BridgeDisposedError";
  }
}

export function cancelledBridgeOperation(explicit: boolean): void {
  if (explicit)
    throw new DOMException("Bridge connection cancelled", "AbortError");
}
export function isBridgeAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * A bridge operation that was CANCELLED rather than failed: its lifetime was
 * invalidated mid-flight (a space, agent or session switch aborted the request
 * it was waiting on), or it reached a controller already
 * disposed. Nothing broke and a newer scope owns the bridge, so no surface
 * reports it: not a toast, not Sentry, not even a quiet class.
 */
export function isBridgeCancellation(error: unknown): boolean {
  return isBridgeAbort(error) || error instanceof BridgeDisposedError;
}

function refusedWith(error: unknown, status: number): error is Error {
  return error instanceof Error && refusalStatus(error) === status;
}

/**
 * The host answers absence in its nested shape (`{ error: { code } }`, which
 * HoustonEngineError's `code` getter reads); the gateway puts the code at the
 * top level of the body.
 */
export function isBridgeAbsent(error: unknown): boolean {
  if (!refusedWith(error, 404)) return false;
  const nested = (error as { code?: unknown }).code;
  return (
    nested === "bridge_not_found" || refusalCode(error) === "bridge_not_found"
  );
}

/**
 * A renewal for a session generation the relay no longer holds (it restarted,
 * or the renewal came after the session lapsed). Nothing is wrong with the
 * bridge: a fresh session (no generation) recovers it.
 */
export function isStaleBridgeSession(error: unknown): boolean {
  return refusedWith(error, 409) && refusalCode(error) === "stale_session";
}

/**
 * The gateway could not match the old tunnel's proof, so the migration never
 * completes on its own: the person connects the model again, which needs no
 * proof.
 */
export function isMigrationReconnect(error: unknown): boolean {
  return (
    refusedWith(error, 409) &&
    refusalCode(error) === "migration_requires_reconnect"
  );
}

/**
 * The native bridge could not reach, or timed out reaching, the gateway's
 * relay: the device dropped off the network or the relay is rolling. The
 * native port rejects with the plain strings `BridgeError`'s Display renders
 * (`crates/local-model-bridge/src/types.rs`), and the SDK retries on its
 * reconnecting curve. A handshake the relay answered with
 * an HTTP status ("Bridge connection refused (401)") is not this: the
 * network worked and our side said no, so it stays a loud report.
 */
export function isBridgeRelayUnreachable(error: unknown): boolean {
  return (
    error === "Bridge connection failed" ||
    error === "Bridge operation timed out"
  );
}
