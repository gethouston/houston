import {
  type ProviderConnectionStatus,
  providerIsConnected,
} from "../../lib/provider-connection.ts";

type ProviderReconnectStatus = ProviderConnectionStatus & {
  auth_state: NonNullable<ProviderConnectionStatus["auth_state"]>;
};

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
  return providerIsConnected(status);
}

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
