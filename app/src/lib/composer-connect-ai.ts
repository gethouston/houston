import type { PendingInteraction } from "@houston/protocol";
import {
  type ProviderConnectionStatus,
  providerConnectionState,
  providerIsConnected,
} from "./provider-connection.ts";

export interface ConnectAiComposerSignals {
  statusesLoading: boolean;
  statusesError: boolean;
  connectedCount: number;
  checkingCount: number;
  catalogReady: boolean;
  capabilitiesLoaded: boolean;
}

export function shouldReplaceComposerWithConnectAi(
  signals: ConnectAiComposerSignals,
): boolean {
  if (signals.statusesLoading || signals.statusesError) return false;
  if (!signals.catalogReady || !signals.capabilitiesLoaded) return false;
  if (signals.checkingCount > 0) return false;
  return signals.connectedCount === 0;
}

export function shouldShowConnectAiEmptyState(
  emptyStateAvailable: boolean,
  interaction: PendingInteraction | null,
): boolean {
  return (
    emptyStateAvailable &&
    !interaction?.steps.some((step) => step.kind === "provider_connect")
  );
}

export function providerConnectionCounts(
  statuses: Record<string, ProviderConnectionStatus>,
): Pick<ConnectAiComposerSignals, "connectedCount" | "checkingCount"> {
  const values = Object.values(statuses);
  return {
    connectedCount: values.filter((s) => providerIsConnected(s)).length,
    checkingCount: values.filter(
      (s) => providerConnectionState(s, false) === "checking",
    ).length,
  };
}
