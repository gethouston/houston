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

export function providerIsAuthenticated(status: ProviderReconnectStatus): boolean {
  return status.cli_installed && status.auth_state === "authenticated";
}

/**
 * Whether the settings UI should present a provider as connected (show
 * "Sign out" instead of the "Connect" CTA).
 *
 * Mirrors providerReconnectSignalState: only a *confirmed* signed-out state
 * counts as disconnected. An "unknown" probe result — `claude auth status`
 * timed out or returned a format the classifier doesn't recognize, which is
 * common for Anthropic (the reason #76 introduced this gating) — is NOT
 * treated as disconnected. Claude usually still works in that state, so a
 * "Connect" button is wrong and, worse, never clears after a successful
 * sign-in because the follow-up probe is unknown too.
 */
export function providerAppearsConnected(status: ProviderReconnectStatus): boolean {
  return status.cli_installed && status.auth_state !== "unauthenticated";
}
