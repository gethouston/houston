import { useEffect, useRef, useState } from "react";
import {
  useCustomIntegrationsFor,
  useIntegrationToolkits,
} from "../hooks/queries";
import {
  type ConnectCardView,
  deriveConnectCardView,
  findCatalogToolkit,
} from "./integration-connect-card-state";
import type { AppDisplay } from "./integrations";
import {
  type CuratedIntegration,
  curatedIntegrationOf,
  curatedLogoUrl,
  INTEGRATION_PROVIDER,
} from "./integrations";
import { useIntegrationConnect } from "./use-integration-connect";

export function useChatConnect({
  toolkit,
  agentId,
  accountScope,
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
  curatedDialog: CuratedIntegration | null;
  curatedProviderConnect?: () => void;
  closeCuratedDialog: () => void;
} {
  const slug = toolkit.trim().toLowerCase();
  const curated = curatedIntegrationOf(slug);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fired = useRef(false);
  const speakOnce = (slug: string, appName: string) => {
    if (fired.current) return;
    fired.current = true;
    onConnected?.(slug, appName);
  };
  const composio = useIntegrationConnect({
    toolkit,
    agentId,
    accountScope,
    connectedAfter,
    ...(curated
      ? { onConnected: speakOnce, autoContinueWhenConnected: false }
      : { onConnected, autoContinueWhenConnected }),
  });
  const list = useCustomIntegrationsFor(agentId);
  const view = curated
    ? list.data?.find((item) => item.slug === slug)
    : undefined;
  const curatedConnected =
    (!connectedAfter && view?.state.status === "active") ||
    (curated !== undefined && composio.isConnected);
  const providerCatalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const providerHasCurated =
    curated !== undefined &&
    findCatalogToolkit(providerCatalog.data, slug) !== undefined;

  const curatedName = curated?.name;
  useEffect(() => {
    if (!curatedName || !autoContinueWhenConnected || !curatedConnected) {
      return;
    }
    speakOnce(slug, curatedName);
  });

  if (!curated) {
    return {
      ...composio,
      curatedDialog: null,
      closeCuratedDialog: () => setDialogOpen(false),
    };
  }
  return {
    app: {
      toolkit: slug,
      name: curated.name,
      description: "",
      logoUrl: curatedLogoUrl(slug),
    },
    isConnected: curatedConnected,
    connecting: composio.connecting,
    view: deriveConnectCardView(curatedConnected, composio.connecting),
    startConnect: async () => setDialogOpen(true),
    curatedDialog: dialogOpen && !curatedConnected ? curated : null,
    ...(providerHasCurated
      ? { curatedProviderConnect: () => void composio.startConnect() }
      : {}),
    closeCuratedDialog: () => setDialogOpen(false),
  };
}
