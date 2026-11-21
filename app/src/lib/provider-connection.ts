export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

export interface ProviderConnectionStatus {
  cli_installed: boolean;
  authenticated?: boolean;
  auth_state?: ProviderAuthState;
}

export type ProviderConnectionState = "connected" | "checking" | "disconnected";

export function providerConnectionState(
  status: ProviderConnectionStatus | undefined,
  probing: boolean,
): ProviderConnectionState {
  if (!status) return probing ? "checking" : "disconnected";
  if (status.auth_state === "unknown") return "checking";
  if (!status.cli_installed) return "disconnected";
  if (status.auth_state === undefined) {
    return status.authenticated ? "connected" : "disconnected";
  }
  return status.auth_state === "authenticated" ? "connected" : "disconnected";
}

export function providerIsConnected(
  status: ProviderConnectionStatus | undefined,
): boolean {
  return providerConnectionState(status, false) === "connected";
}

export function providerNotConfirmedDisconnected(
  status: ProviderConnectionStatus | undefined,
): boolean {
  if (!status) return false;
  if (status.auth_state === undefined) return status.cli_installed;
  return providerConnectionState(status, false) !== "disconnected";
}

export type ProviderProbeOutcome =
  | { ok: true; status: ProviderConnectionStatus }
  | { ok: false };

export function reconnectCardShouldClear(probe: ProviderProbeOutcome): boolean {
  return probe.ok && providerIsConnected(probe.status);
}
