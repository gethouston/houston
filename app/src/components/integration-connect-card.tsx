import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../hooks/queries";
import { analytics } from "../lib/analytics";
import { useUIStore } from "../stores/ui";
import { RowCard } from "./cards/row-card";
import { RowCardButton } from "./cards/row-card-button";
import {
  deriveConnectCardView,
  findCatalogToolkit,
  isToolkitConnected,
  normalizeToolkitSlug,
} from "./integration-connect-card-state";
import { appDisplay } from "./tabs/integrations-app-display";
import { INTEGRATION_PROVIDER } from "./tabs/integrations-tab-model";
import { useIntegrationConnect } from "./tabs/use-integration-connect";

interface IntegrationConnectCardProps {
  /** The raw `#houston_toolkit=<slug>` fragment from the agent's link. */
  toolkit: string;
  /** The agent whose chat hosts the card (multiplayer grant attribution). */
  agentId: string;
  /** Multiplayer: auto-grant a fresh connection to this agent (C4). */
  autoGrant: boolean;
  /**
   * Fired once when a connection the user started from THIS card lands. The
   * chat panel uses it to nudge the agent ("I've connected X. Please
   * continue.") so the task resumes without the user having to type.
   */
  onConnected?: (toolkit: string, appName: string) => void;
}

/**
 * Rich inline card rendered in place of a plain markdown link when the agent
 * tags a URL with `#houston_toolkit=<slug>` — the in-chat integration connect
 * hand-off on the TS engine (HOU-670). Clicking Connect mints the hosted
 * OAuth link, opens the system browser, and polls until the connection turns
 * active (`useIntegrationConnect`, the same flow as the Integrations tab).
 *
 * The card owns its own connection status: it renders inside Streamdown,
 * which memoizes finished markdown blocks by source text and stops re-invoking
 * the link renderer — a parent-computed prop would freeze at first render and
 * never reflect a connection that lands afterwards. Subscribing to the shared
 * queries here re-renders the card the moment status changes; TanStack dedupes
 * the fetches, so N cards still issue one request per tick.
 */
export function IntegrationConnectCard({
  toolkit,
  agentId,
  autoGrant,
  onConnected,
}: IntegrationConnectCardProps) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);

  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);

  const slug = normalizeToolkitSlug(toolkit);
  const isConnected = isToolkitConnected(connections.data, toolkit);
  const app = appDisplay(slug, findCatalogToolkit(catalog.data, toolkit));
  const displayName = app.name === slug ? toolkit.trim() : app.name;

  const { connectingToolkit, connect } = useIntegrationConnect({
    agentId,
    autoGrant,
  });
  // The nudge fires at most once per card, and only for a connection the
  // user drove from HERE — a connection landing via the Integrations tab or
  // another card must not make this one speak.
  const followupFired = useRef(false);

  const startConnect = async () => {
    const outcome = await connect(slug);
    if (outcome !== "active" || followupFired.current) return;
    followupFired.current = true;
    analytics.track("integration_connected", { integration_slug: slug });
    onConnected?.(slug, displayName);
    addToast({
      title: t("composio.verifiedToast", { name: displayName }),
      variant: "success",
    });
  };

  const view = deriveConnectCardView(isConnected, connectingToolkit !== null);

  return (
    <RowCard
      inline
      truncate
      media={<AppLogo name={displayName} logoUrl={app.logoUrl} />}
      title={displayName}
      description={
        isConnected
          ? t("composio.alreadyConnected")
          : app.description || t("composio.integration")
      }
      action={<ConnectStatusSlot view={view} onConnect={startConnect} />}
    />
  );
}

/**
 * Right-slot: status (badge) stays visually distinct from the action (the
 * Connect button) — see issue #379 for why fusing them was ambiguous.
 */
function ConnectStatusSlot({
  view,
  onConnect,
}: {
  view: ReturnType<typeof deriveConnectCardView>;
  onConnect: () => Promise<void>;
}) {
  const { t } = useTranslation("chat");

  if (view === "connected") {
    return (
      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-xs font-medium shrink-0">
        <Check className="size-3" />
        {t("composio.connected")}
      </span>
    );
  }
  if (view === "connecting") {
    return (
      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-secondary text-muted-foreground text-xs font-medium shrink-0">
        <Loader2 className="size-3 animate-spin" />
        {t("composio.connecting")}
      </span>
    );
  }
  return (
    <RowCardButton
      label={t("composio.connect")}
      onClick={onConnect}
      icon={<ExternalLink className="size-3" />}
      iconPosition="trailing"
    />
  );
}

/**
 * App logo with an initial-letter fallback, span-based (NOT the block `Logo`
 * from the Integrations tab) so it nests validly inside the inline RowCard
 * embedded in chat prose.
 */
function AppLogo({ name, logoUrl }: { name: string; logoUrl: string }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <span className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <img
      src={logoUrl}
      alt={name}
      className="size-8 rounded-lg object-contain shrink-0"
      onError={() => setImgError(true)}
    />
  );
}
