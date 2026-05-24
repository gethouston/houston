type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

interface ProviderReconnectStatus {
  cli_installed: boolean;
  auth_state: ProviderAuthState;
}

export type ProviderReconnectSignalState = "needs_auth" | "resolved";

export function providerReconnectSignalState(
  status: ProviderReconnectStatus,
): ProviderReconnectSignalState {
  return status.cli_installed && status.auth_state === "unauthenticated"
    ? "needs_auth"
    : "resolved";
}

export function providerIsAuthenticated(
  status: ProviderReconnectStatus,
): boolean {
  return status.cli_installed && status.auth_state === "authenticated";
}
