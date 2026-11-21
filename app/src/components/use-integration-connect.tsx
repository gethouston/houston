import { useEffect, useRef } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../hooks/queries";
import { analytics } from "../lib/analytics";
import {
  type ConnectCardView,
  deriveConnectCardView,
  findCatalogToolkit,
  isToolkitConnected,
  normalizeToolkitSlug,
  shouldAutoContinueConnected,
} from "./integration-connect-card-state";
import {
  type AppDisplay,
  appDisplay,
  INTEGRATION_PROVIDER,
  useConnectFlow,
} from "./integrations";
import { useIntegrationProviderReady } from "./integrations/use-toolkit-catalog";

export function useIntegrationConnect({
  toolkit,
  agentId,
  accountScope = false,
  onConnected,
  autoContinueWhenConnected = false,
  connectedAfter,
}: {
  toolkit: string;
  agentId: string;
  accountScope?: boolean;
  onConnected?: (toolkit: string, appName: string) => void;
  autoContinueWhenConnected?: boolean;
  connectedAfter?: string;
}): {
  app: AppDisplay;
  isConnected: boolean;
  connecting: boolean;
  view: ConnectCardView;
  startConnect: () => Promise<void>;
} {
  const ready = useIntegrationProviderReady();
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);

  const slug = normalizeToolkitSlug(toolkit);
  const catalogEntry = findCatalogToolkit(catalog.data, toolkit);
  const isConnected = isToolkitConnected(
    connections.data,
    toolkit,
    catalogEntry,
    connectedAfter,
  );
  const resolved = appDisplay(slug, catalogEntry);
  const app: AppDisplay = {
    ...resolved,
    logoUrl: catalog.isFetched ? resolved.logoUrl : "",
  };

  const { states, connect } = useConnectFlow({
    agentId: accountScope ? undefined : agentId,
  });
  const connecting = slug in states;
  const followupFired = useRef(false);

  const startConnect = async () => {
    const { outcome, initiated } = await connect(
      slug,
      `chat:${agentId}:${slug}`,
    );
    if (!initiated || outcome !== "active" || followupFired.current) return;
    followupFired.current = true;
    analytics.track("integration_connected", { integration_slug: slug });
    onConnected?.(slug, app.name);
  };

  const appName = app.name;
  useEffect(() => {
    if (
      !shouldAutoContinueConnected({
        autoContinue: autoContinueWhenConnected,
        isConnected,
        catalogSettled: catalog.isFetched,
        alreadyFired: followupFired.current,
      })
    )
      return;
    followupFired.current = true;
    onConnected?.(slug, appName);
  }, [
    autoContinueWhenConnected,
    isConnected,
    catalog.isFetched,
    slug,
    appName,
    onConnected,
  ]);

  return {
    app,
    isConnected,
    connecting,
    view: deriveConnectCardView(isConnected, connecting),
    startConnect,
  };
}
