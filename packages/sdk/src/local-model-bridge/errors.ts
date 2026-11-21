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

export function isRegistrationRefusal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error))
    return false;
  return [400, 403, 422].includes(Number(error.status));
}

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

export function isBridgeCancellation(error: unknown): boolean {
  return isBridgeAbort(error) || error instanceof BridgeDisposedError;
}

function refusedWith(error: unknown, status: number): error is Error {
  return error instanceof Error && refusalStatus(error) === status;
}

export function isBridgeAbsent(error: unknown): boolean {
  if (!refusedWith(error, 404)) return false;
  const nested = (error as { code?: unknown }).code;
  return (
    nested === "bridge_not_found" || refusalCode(error) === "bridge_not_found"
  );
}

export function isStaleBridgeSession(error: unknown): boolean {
  return refusedWith(error, 409) && refusalCode(error) === "stale_session";
}

export function isMigrationReconnect(error: unknown): boolean {
  return (
    refusedWith(error, 409) &&
    refusalCode(error) === "migration_requires_reconnect"
  );
}

export function isBridgeRelayUnreachable(error: unknown): boolean {
  return (
    error === "Bridge connection failed" ||
    error === "Bridge operation timed out"
  );
}
