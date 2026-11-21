import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { type AppDisplay, appDisplay } from "./app-display";
import { groupAccounts, partitionConnections } from "./connected-apps-model";
import { INTEGRATION_PROVIDER } from "./model";

export interface ActiveAppRow {
  connection: IntegrationConnection;
  accounts: IntegrationConnection[];
  app: AppDisplay;
}

export interface ConnectedApps {
  connData: IntegrationConnection[];
  catalogData: IntegrationToolkit[];
  bySlug: ReadonlyMap<string, IntegrationToolkit>;
  activeRows: ActiveAppRow[];
  catalogLoading: boolean;
  isLoading: boolean;
}

export function useConnectedApps(
  curatedExtras: IntegrationToolkit[] = [],
): ConnectedApps {
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);

  const connData = connections.data ?? [];
  const catalogData = useMemo(
    () => [...(catalog.data ?? []), ...curatedExtras],
    [catalog.data, curatedExtras],
  );
  const bySlug = useMemo(
    () => new Map(catalogData.map((tk) => [tk.slug, tk])),
    [catalogData],
  );

  const activeRows = useMemo(
    () =>
      groupAccounts(partitionConnections(connData).installed)
        .map(({ connection, accounts }) => ({
          connection,
          accounts,
          app: appDisplay(connection.toolkit, bySlug.get(connection.toolkit)),
        }))
        .sort((a, b) => a.app.name.localeCompare(b.app.name)),
    [connData, bySlug],
  );

  return {
    connData,
    catalogData,
    bySlug,
    activeRows,
    catalogLoading: catalog.isLoading,
    isLoading: connections.isLoading || catalog.isLoading,
  };
}
