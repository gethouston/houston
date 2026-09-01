import { useEffect, useRef, useState } from "react";
import { useCustomIntegrationsFor } from "../hooks/queries";
import {
  type ConnectCardView,
  deriveConnectCardView,
} from "./integration-connect-card-state";
import type { AppDisplay } from "./integrations";
import {
  type CuratedIntegration,
  curatedIntegrationOf,
  curatedLogoUrl,
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
  closeCuratedDialog: () => void;
} {
  const slug = toolkit.trim().toLowerCase();
  const curated = curatedIntegrationOf(slug);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Both hooks always mount (hooks are unconditional); the Composio one is
  // inert for a curated slug — never in its connections, so it cannot
  // self-report — and this one is inert for a Composio slug.
  const composio = useIntegrationConnect({
    toolkit,
    agentId,
    onConnected,
    autoContinueWhenConnected,
  });
  const list = useCustomIntegrationsFor(agentId);
  const view = curated
    ? list.data?.find((item) => item.slug === slug)
    : undefined;
  const curatedConnected = view?.state.status === "active";

  // Fire the resume nudge once, whenever the curated connection is (or lands)
  // active while this step sits on the live frontier — the browser sign-in
  // completes out-of-band, so the landing arrives as a list refresh, not as a
  // resolution of anything the card awaited.
  const fired = useRef(false);
  const curatedName = curated?.name;
  useEffect(() => {
    if (
      !curatedName ||
      !autoContinueWhenConnected ||
      !curatedConnected ||
      fired.current
    )
      return;
    fired.current = true;
    onConnected?.(slug, curatedName);
  }, [
    curatedName,
    autoContinueWhenConnected,
    curatedConnected,
    slug,
    onConnected,
  ]);

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
    connecting: false,
    view: deriveConnectCardView(curatedConnected, false),
    startConnect: async () => setDialogOpen(true),
    curatedDialog: dialogOpen && !curatedConnected ? curated : null,
    closeCuratedDialog: () => setDialogOpen(false),
  };
}
