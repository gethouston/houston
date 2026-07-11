import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "./cards/row-card";
import { RowCardButton } from "./cards/row-card-button";
import type { ConnectCardView } from "./integration-connect-card-state";
import { AppLogo } from "./integrations";
import { useIntegrationConnect } from "./use-integration-connect";

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
 * active (via {@link useIntegrationConnect}, the same flow as the Integrations
 * tab). It stays a passive badge inside assistant prose; the interaction
 * stepper's connect STEP renders its own Mercury row + footer CTA
 * ({@link ChatConnectInteractionCard}) over the same hook.
 */
export function IntegrationConnectCard({
  toolkit,
  agentId,
  autoGrant,
  onConnected,
}: IntegrationConnectCardProps) {
  const { t } = useTranslation("chat");
  const { app, isConnected, view, startConnect } = useIntegrationConnect({
    toolkit,
    agentId,
    autoGrant,
    onConnected,
  });

  return (
    <RowCard
      inline
      truncate
      media={<AppLogo display={app} />}
      title={app.name}
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
  view: ConnectCardView;
  onConnect: () => Promise<void>;
}) {
  const { t } = useTranslation("chat");

  if (view === "connected") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 font-medium text-emerald-700 text-xs dark:bg-emerald-950 dark:text-emerald-400">
        <Check className="size-3" />
        {t("composio.connected")}
      </span>
    );
  }
  if (view === "connecting") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 font-medium text-muted-foreground text-xs">
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
