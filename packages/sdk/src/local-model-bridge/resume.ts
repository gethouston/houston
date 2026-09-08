import { bootstrapLocalModelBridge } from "./bootstrap";
import { isAuthorizationFailure } from "./errors";
import { bridgeToResume } from "./migration";
import { bridgeRetry } from "./retry";
import type { LocalBridgeSnapshot, LocalModelBridgePorts } from "./types";

export async function discoverBridge(
  ports: LocalModelBridgePorts,
  signal: AbortSignal,
) {
  try {
    return await bootstrapLocalModelBridge(
      (next) => bridgeToResume(ports, next),
      signal,
      ports,
    );
  } catch (error) {
    if (signal.aborted) return null;
    ports.report(error);
    return {
      kind: "terminal" as const,
      status: bridgeRetry(error, 0, ports.random ?? Math.random).status,
    };
  }
}
export async function bridgeNeedsWake(
  ports: LocalModelBridgePorts,
  snapshot: LocalBridgeSnapshot,
  signal: AbortSignal,
) {
  const { status, descriptor, sessionExpiresAt } = snapshot;
  const bridgeId = descriptor?.bridgeId;
  if (
    [
      "authorization_required",
      "revoked",
      "disabled",
      "reconnect_required",
      "connecting",
    ].includes(status)
  )
    return undefined;
  if (status !== "online" || !bridgeId) return "reconnecting" as const;
  try {
    const remote = await ports.management.status(bridgeId, signal);
    signal.throwIfAborted();
    if (remote.status === "revoked") return remote.status;
    if (
      remote.status === "offline" ||
      (sessionExpiresAt &&
        Date.parse(sessionExpiresAt) <= (ports.now ?? Date.now)())
    )
      return "reconnecting" as const;
    return undefined;
  } catch (error) {
    signal.throwIfAborted();
    ports.report(error);
    if (isAuthorizationFailure(error)) return "authorization_required" as const;
    return undefined;
  }
}
