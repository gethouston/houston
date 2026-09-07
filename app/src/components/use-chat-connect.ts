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

/**
 * The connect step's logic for BOTH families of toolkit: a Composio catalog
 * app (the {@link useIntegrationConnect} OAuth hand-off) and a curated entry
 * (Croma…), whose Connect opens the curated two-option dialog instead — the
 * generic provider connect would 400 on those slugs. One merged shape so the
 * card renders identically either way.
 *
 * Curated "connected" truth is the custom-integration list (state `active`,
 * updated by the `CustomIntegrationsChanged` event), not the Composio
 * connections — so a sign-in finishing in the browser flips the card and
 * fires the auto-continue nudge without any client-side poll.
 */
export function useChatConnect({
  toolkit,
  agentId,
  onConnected,
  autoContinueWhenConnected = false,
}: {
  toolkit: string;
  agentId: string;
  onConnected?: (toolkit: string, appName: string) => void;
  autoContinueWhenConnected?: boolean;
}): {
  app: AppDisplay;
  isConnected: boolean;
  connecting: boolean;
  view: ConnectCardView;
  startConnect: () => Promise<void>;
  /** The curated dialog's subject — render `CuratedConnectDialog` with it. */
  curatedDialog: CuratedIntegration | null;
  /** The dialog's provider (Composio) connect, when that catalog has the
   *  app — the same hand-off a plain Composio card runs. */
  curatedProviderConnect?: () => void;
  closeCuratedDialog: () => void;
} {
  const slug = toolkit.trim().toLowerCase();
  const curated = curatedIntegrationOf(slug);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Both hooks always mount (hooks are unconditional); the Composio one is
  // inert for a curated slug — never in its connections, so it cannot
  // self-report — and this one is inert for a Composio slug.
  // One voice for a curated slug: a Composio connect the user drove from the
  // dialog reports through the provider hook, an MCP sign-in (or an already-
  // connected step) through the effect below — and `fired` lets whichever
  // lands first speak, never both. Auto-continue stays with the effect, which
  // knows both paths' truth.
  const fired = useRef(false);
  const speakOnce = (slug: string, appName: string) => {
    if (fired.current) return;
    fired.current = true;
    onConnected?.(slug, appName);
  };
  const composio = useIntegrationConnect({
    toolkit,
    agentId,
    ...(curated
      ? { onConnected: speakOnce, autoContinueWhenConnected: false }
      : { onConnected, autoContinueWhenConnected }),
  });
  const list = useCustomIntegrationsFor(agentId);
  const view = curated
    ? list.data?.find((item) => item.slug === slug)
    : undefined;
  // Connected through EITHER path: the MCP definition or the provider's own
  // app (Composio's HighLevel) — both make the agent's tools work.
  const curatedConnected =
    view?.state.status === "active" ||
    (curated !== undefined && composio.isConnected);
  const providerCatalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const providerHasCurated =
    curated !== undefined &&
    findCatalogToolkit(providerCatalog.data, slug) !== undefined;

  // Fire the resume nudge once, whenever the curated connection is (or lands)
  // active while this step sits on the live frontier — the browser sign-in
  // completes out-of-band, so the landing arrives as a list refresh, not as a
  // resolution of anything the card awaited.
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
