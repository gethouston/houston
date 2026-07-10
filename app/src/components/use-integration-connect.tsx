import { prettifyToolkit } from "@houston-ai/chat";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../hooks/queries";
import { analytics } from "../lib/analytics";
import { useUIStore } from "../stores/ui";
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

/**
 * The reactive connect logic behind BOTH in-chat connect surfaces — the inline
 * markdown-link {@link IntegrationConnectCard} (a passive badge in assistant
 * prose) and the stepper's connect step ({@link ChatConnectInteractionCard},
 * a Mercury row with a footer CTA). Extracted so the two render shapes never
 * duplicate the status subscription, the OAuth hand-off, or the already-
 * connected self-report; only their presentation differs.
 *
 * The card owns its own connection status (it subscribes to the shared
 * integration queries directly) so it stays reactive inside Streamdown's
 * memoized markdown blocks: a parent-computed prop would freeze at first
 * render and never reflect a connection that lands afterwards. TanStack
 * dedupes the fetches, so N cards still issue one request per tick.
 */
export function useIntegrationConnect({
  toolkit,
  agentId,
  autoGrant,
  onConnected,
  autoContinueWhenConnected = false,
}: {
  toolkit: string;
  agentId: string;
  autoGrant: boolean;
  /**
   * Fired once when a connection the user started from THIS surface lands (or,
   * in stepper mode, once an already-active toolkit resolves — see
   * `autoContinueWhenConnected`). The chat panel uses it to nudge the agent so
   * the task resumes without the user retyping.
   */
  onConnected?: (toolkit: string, appName: string) => void;
  /**
   * Stepper mode (a `request_connection` step inside the interaction sequence):
   * when the toolkit is ALREADY connected there is no Connect button to click,
   * so fire `onConnected` once the status resolves to advance the sequence
   * instead of soft-locking on a dead "Connected" badge. The inline
   * markdown-link card leaves this off and stays a passive badge.
   */
  autoContinueWhenConnected?: boolean;
}): {
  app: AppDisplay;
  displayName: string;
  isConnected: boolean;
  connecting: boolean;
  view: ConnectCardView;
  startConnect: () => Promise<void>;
} {
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
  // Catalog miss (app.name fell back to the slug): show a best-effort human
  // label from the slug itself, never the raw "googlesheets" string.
  const displayName = app.name === slug ? prettifyToolkit(toolkit) : app.name;

  const { state: connectState, connect } = useConnectFlow({
    agentId,
    autoGrant,
  });
  // The nudge fires at most once per surface, and only for a connection the
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

  // Stepper mode: an already-connected toolkit shows only a badge, so nothing
  // the user can click ever advances the sequence. Self-report once the status
  // (and the catalog, for a real display name) resolves so the queued answers
  // still get sent. Shares `followupFired` with `startConnect` so a surface can
  // speak at most once. No analytics/toast here: the user connected earlier,
  // this only unblocks the flow.
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
    onConnected?.(slug, displayName);
  }, [
    autoContinueWhenConnected,
    isConnected,
    catalog.isFetched,
    slug,
    displayName,
    onConnected,
  ]);

  return {
    app,
    displayName,
    isConnected,
    connecting: connectState !== null,
    view: deriveConnectCardView(isConnected, connectState !== null),
    startConnect,
  };
}

/**
 * App logo with an initial-letter fallback, span-based (NOT the block `Logo`
 * from the Integrations tab) so it nests validly both inside the inline RowCard
 * embedded in chat prose AND the stepper's Mercury row.
 */
export function ConnectAppLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string;
}) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent">
        <span className="font-semibold text-muted-foreground text-xs">
          {name.charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <img
      alt={name}
      className="size-8 shrink-0 rounded-lg object-contain"
      onError={() => setImgError(true)}
      src={logoUrl}
    />
  );
}
