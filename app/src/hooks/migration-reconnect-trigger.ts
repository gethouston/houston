import {
  type ProviderConnectionStatus,
  providerConnectionState,
  providerIsConnected,
} from "../lib/provider-connection.ts";

export interface MigrationProviderSignals {
  hasProvider: boolean;
  unconfirmable: boolean;
}

export function migrationProviderSignals(
  statuses: readonly ProviderConnectionStatus[],
): MigrationProviderSignals {
  return {
    hasProvider: statuses.some((s) => providerIsConnected(s)),
    unconfirmable: statuses.some(
      (s) => providerConnectionState(s, false) === "checking",
    ),
  };
}

export interface MigrationReconnectInputs {
  newEngine: boolean;
  coLocated: boolean;
  migrated: boolean;
  hasProvider: boolean;
  dismissed: boolean;
  loading: boolean;
}

export function shouldShowMigrationReconnect(
  i: MigrationReconnectInputs,
): boolean {
  if (i.loading) return false;
  if (!i.newEngine) return false;
  if (!i.coLocated) return false;
  if (!i.migrated) return false;
  if (i.hasProvider) return false;
  if (i.dismissed) return false;
  return true;
}
