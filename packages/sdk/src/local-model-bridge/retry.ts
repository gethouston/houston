import {
  BridgeStateError,
  isAuthorizationFailure,
  isBridgeUnsupported,
  isPermanentBridgeFailure,
} from "./errors";
import type { LocalBridgeStatus } from "./types";

export function bridgeRetry(
  error: unknown,
  attempt: number,
  random: () => number,
): { status: LocalBridgeStatus; delay: number | null } {
  const migrationMismatch =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "migration_requires_reconnect";
  // An unsupported deployment is terminal and quiet: the bridge is simply
  // disabled here, nothing reconnects it.
  if (isBridgeUnsupported(error)) return { status: "disabled", delay: null };
  const status =
    migrationMismatch || isPermanentBridgeFailure(error)
      ? "reconnect_required"
      : error instanceof BridgeStateError
        ? error.status
        : isAuthorizationFailure(error)
          ? "authorization_required"
          : "reconnecting";
  const delay =
    status === "authorization_required" ||
    status === "revoked" ||
    status === "reconnect_required"
      ? null
      : Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) *
        (0.5 + 0.5 * random());
  return { status, delay };
}
