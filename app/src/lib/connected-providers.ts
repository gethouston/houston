import {
  type ProviderConnectionStatus,
  providerConnectionState,
  providerIsConnected,
} from "./provider-connection.ts";
import { providerName } from "./providers.ts";
import type { ConnectedProviderRef } from "./setup-chat-prompt-shared.ts";

export interface ScannedProviderStatus extends ProviderConnectionStatus {
  provider: string;
}

export interface ProviderScan {
  statuses: Record<string, ScannedProviderStatus>;
  isLoading: boolean;
  isError: boolean;
}

export function confirmedConnectedProviders(
  scan: ProviderScan,
): ConnectedProviderRef[] | null {
  const values = Object.values(scan.statuses);
  const unconfirmable = values.some(
    (status) => providerConnectionState(status, false) === "checking",
  );
  if (scan.isLoading || scan.isError || unconfirmable) return null;
  return values
    .filter((status) => providerIsConnected(status))
    .map((status) => ({
      id: status.provider,
      name: providerName(status.provider),
    }));
}

export function connectedProviderIds(
  connected: readonly ConnectedProviderRef[] | null,
): string[] | null {
  return connected ? connected.map((provider) => provider.id) : null;
}
