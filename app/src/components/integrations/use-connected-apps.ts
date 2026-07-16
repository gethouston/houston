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

/** A pending / errored connection with its display, shown for recovery. */
export interface RecoveringAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

export interface ConnectedApps {
  connData: IntegrationConnection[];
  catalogData: IntegrationToolkit[];
  bySlug: ReadonlyMap<string, IntegrationToolkit>;
  activeRows: ActiveAppRow[];
  recoveringRows: RecoveringAppRow[];
  /** The catalog query alone is still fetching (the picker shows a loader). */
  catalogLoading: boolean;
  isLoading: boolean;
}

/**
 * All the derived read-model for the global Integrations page in one place: the
 * connection + catalog queries and the sorted active / recovering rows. The
 * page is a personal-connections surface only (permissions live in the
 * Permissions view), so there is no per-agent grant plumbing here. Kept out of
 * the view so the JSX stays a thin render of these values.
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

  const { activeRows, recoveringRows } = useMemo(() => {
    const { active, recovering } = partitionConnections(connData);
    const byName = (
      a: { app: { name: string } },
      b: { app: { name: string } },
    ) => a.app.name.localeCompare(b.app.name);
    return {
      activeRows: active
        .map((c) => ({
          connection: c,
          app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
        }))
        .sort(byName),
      recoveringRows: recovering
        .map((c) => ({
          connection: c,
          app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
        }))
        .sort(byName),
    };
  }, [connData, bySlug]);

  return {
    connData,
    catalogData,
    bySlug,
    activeRows,
    recoveringRows,
    catalogLoading: catalog.isLoading,
    isLoading: connections.isLoading || catalog.isLoading,
  };
}
