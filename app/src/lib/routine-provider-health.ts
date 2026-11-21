import type { ProviderHealth } from "@houston/engine-adapter";

export type RoutineProviderHealth =
  | "connected"
  | "not_connected"
  | "needs_reconnect"
  | "out_of_credits"
  | "checking";

export interface RoutineProviderStatusLike {
  authenticated?: boolean;
  auth_state?: "authenticated" | "unauthenticated" | "unknown";
  health?: ProviderHealth;
}

export function routineProviderHealth(
  status: RoutineProviderStatusLike | undefined,
): RoutineProviderHealth {
  if (!status) return "checking";
  if (status.auth_state === "unknown" || status.health === "unreachable") {
    return "checking";
  }
  const configured = connectedClaim(status);
  if (status.health) {
    if (configured === undefined) return status.health;
    if (!configured)
      return status.health === "needs_reconnect"
        ? "needs_reconnect"
        : "not_connected";
    return status.health === "not_connected" ? "connected" : status.health;
  }
  return configured ? "connected" : "not_connected";
}

function connectedClaim(
  status: RoutineProviderStatusLike,
): boolean | undefined {
  if (status.authenticated !== undefined) return status.authenticated;
  if (status.auth_state === undefined) return undefined;
  return status.auth_state === "authenticated";
}

export function routineHealthBlocksRun(health: RoutineProviderHealth): boolean {
  return (
    health === "not_connected" ||
    health === "needs_reconnect" ||
    health === "out_of_credits"
  );
}

export function routineHealthOffersConnect(
  health: RoutineProviderHealth,
): boolean {
  return health === "not_connected" || health === "needs_reconnect";
}
