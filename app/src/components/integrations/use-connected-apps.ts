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
import { partitionConnections } from "./connected-apps-model";
import { INTEGRATION_PROVIDER } from "./model";

/** An active (usable) connection with its display. */
export interface ActiveAppRow {
  connection: IntegrationConnection;
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
export function useConnectedApps(): ConnectedApps {
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);

  const connData = connections.data ?? [];
  const catalogData = catalog.data ?? [];
  const bySlug = useMemo(
    () => new Map(catalogData.map((tk) => [tk.slug, tk])),
    [catalogData],
  );

  const activeRows = useMemo(
    () =>
      partitionConnections(connData)
        .installed.map((c) => ({
          connection: c,
          app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
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
