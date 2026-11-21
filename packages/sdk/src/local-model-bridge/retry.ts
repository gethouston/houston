import {
  BridgeRegistrationRefusedError,
  BridgeStateError,
  isAuthorizationFailure,
  isBridgeUnsupported,
  isMigrationReconnect,
  isPermanentBridgeFailure,
  isStaleBridgeSession,
} from "./errors";
import type { LocalBridgeStatus } from "./types";

export function bridgeRetry(
  error: unknown,
  attempt: number,
  random: () => number,
): { status: LocalBridgeStatus; delay: number | null } {
  if (isBridgeUnsupported(error)) return { status: "disabled", delay: null };
  if (error instanceof BridgeRegistrationRefusedError)
    return { status: "disabled", delay: null };
  const status = isStaleBridgeSession(error)
    ? "reconnecting"
    : isMigrationReconnect(error) || isPermanentBridgeFailure(error)
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
