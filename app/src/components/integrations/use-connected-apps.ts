import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { type AppDisplay, appDisplay } from "./app-display";
import { groupAccounts, partitionConnections } from "./connected-apps-model";
import { INTEGRATION_PROVIDER } from "./model";

/** An active (usable) app with its display — ONE row per toolkit, carrying
 *  every active account behind it (a toolkit can hold two Gmail logins). */
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
  /** The catalog query alone is still fetching (the picker shows a loader). */
  catalogLoading: boolean;
  isLoading: boolean;
}

/**
 * All the derived read-model for the global Integrations page in one place: the
 * connection + catalog queries and the sorted Installed rows. Only WORKING
 * connections become rows here — a pending or errored one is not an installed
 * app, it is a catalog row wearing its status, derived where the catalog is
 * rendered. The page is a personal-connections surface only (permissions live
 * in the Permissions view), so there is no per-agent grant plumbing here. Kept
 * out of the view so the JSX stays a thin render of these values.
 */
export function useConnectedApps(
  /** Hand-curated entries (non-Composio, e.g. Croma) merged into the browse
   *  catalog so they list, search, and filter exactly like provider apps. The
   *  caller derives them (they depend on the custom-integration list + `t()`);
   *  connecting one routes through `onCuratedConnect`, never the provider. */
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
