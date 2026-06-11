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
 * Which provider (if any) the in-chat reconnect card should prompt to
 * reconnect, for a chat whose session runs `chatProvider`.
 *
 * Invariant: a chat's reconnect card may ONLY ever ask the user to reconnect
 * the provider THAT chat uses. The global `authRequired` flag is set by
 * whichever session last hit an auth error — possibly a different provider in
 * a different agent or routine. Before HOU-410 the card read `authRequired`
 * directly, so a Claude logout (from e.g. a routine or another agent) leaked a
 * "Connect Claude" button into unrelated OpenAI chats and never cleared while
 * the user kept using OpenAI.
 *
 * So `authRequired` is honored only when it names this chat's provider;
 * otherwise we fall back to this chat's own feed auth signal (which the card
 * confirms with a provider-scoped status probe). Either way the result is
 * always `chatProvider` or `null` — never a foreign provider.
 */
export function reconnectProviderForChat(args: {
  authRequired: string | null;
  chatProvider: string | null;
  signalNeedsAuth: boolean;
}): string | null {
  const { authRequired, chatProvider, signalNeedsAuth } = args;
  if (!chatProvider) return null;
  if (authRequired === chatProvider) return chatProvider;
  if (signalNeedsAuth) return chatProvider;
  return null;
}
