import {
  type ProviderConnectionStatus,
  providerIsConnected,
} from "../../lib/provider-connection.ts";

type ProviderReconnectStatus = ProviderConnectionStatus & {
  auth_state: NonNullable<ProviderConnectionStatus["auth_state"]>;
};

export type ProviderReconnectSignalState = "needs_auth" | "resolved";

/**
 * Whether a chat's feed auth signal is a real "sign in again" prompt.
 *
 * Only a CONFIRMED signed-out probe raises the card. An `unknown` probe is
 * "checking", not "signed out", so it resolves the signal instead of flashing a
 * reconnect prompt at a provider that may well be connected — and a missing CLI
 * is not something reconnecting can fix.
 */
export function providerReconnectSignalState(
  status: ProviderReconnectStatus,
): ProviderReconnectSignalState {
  return status.cli_installed && status.auth_state === "unauthenticated"
    ? "needs_auth"
    : "resolved";
}

/** CONFIRMED connected. Thin alias over the ONE derivation (HOU-979). */
export function providerIsAuthenticated(
  status: ProviderReconnectStatus,
): boolean {
  return providerIsConnected(status);
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
