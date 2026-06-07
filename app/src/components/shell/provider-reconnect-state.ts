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

/**
 * Settings-row connected state. API-key providers (OpenRouter) require a
 * confirmed `authenticated` probe — same bar as cloud credential export.
 * OAuth/CLI providers keep the lenient `unknown`-as-connected rule (#76).
 */
export function providerSettingsRowConnected(
  status: ProviderReconnectStatus,
  loginKind?: "cli" | "apiKey" | "oauth",
): boolean {
  if (loginKind === "apiKey") {
    return providerIsAuthenticated(status);
  }
  return providerAppearsConnected(status);
}

/** Session auth flag only applies when it matches the composer provider. */
export function authRequiredForActiveProvider(
  authRequired: string | null | undefined,
  activeProviderId: string | null | undefined,
): string | null {
  if (!authRequired || !activeProviderId) return null;
  return authRequired === activeProviderId ? authRequired : null;
}

export function shouldClearStaleAuthRequired(
  authRequired: string | null | undefined,
  activeProviderId: string | null | undefined,
): boolean {
  return Boolean(
    authRequired && activeProviderId && authRequired !== activeProviderId,
  );
}

/** Which provider the inline reconnect card should surface, if any. */
export function resolveReconnectProviderId(args: {
  authRequired: string | null | undefined;
  activeProviderId: string | null | undefined;
  signalNeedsAuth: boolean;
}): string | null {
  const matched = authRequiredForActiveProvider(
    args.authRequired,
    args.activeProviderId,
  );
  if (matched) return matched;
  if (args.signalNeedsAuth && args.activeProviderId) {
    return args.activeProviderId;
  }
  return null;
}
