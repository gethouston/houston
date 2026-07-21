import { prettifyToolkit } from "@houston-ai/chat";
import { useEffect, useRef } from "react";
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
 * an identity row with a footer CTA). Extracted so the two render shapes never
 * duplicate the status subscription, the OAuth hand-off, or the already-
 * connected self-report; only their presentation differs.
 *
 * The returned `app` is display-ready: its `name` is always a human label (the
 * catalog name, or a prettified slug on a catalog miss — never the raw
 * "googlesheets" string), and its `logoUrl` stays EMPTY until the toolkits
 * catalog has settled. Both surfaces render it through the shared `AppLogo`
 * (the Integrations tab's component), whose letter fallback covers the interim.
 * Racing an `<img>` against the still-loading catalog is exactly what ate the
 * production logos: the favicon-guess fallback 404'd first and its error state
 * shadowed the real Composio logo that resolved moments later.
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
  onConnected,
  autoContinueWhenConnected = false,
}: {
  toolkit: string;
  agentId: string;
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
  const resolved = appDisplay(slug, findCatalogToolkit(catalog.data, toolkit));
  const app: AppDisplay = {
    ...resolved,
    // Catalog miss (name fell back to the slug): show a best-effort human
    // label from the slug itself, never the raw "googlesheets" string.
    name: resolved.name === slug ? prettifyToolkit(toolkit) : resolved.name,
    // Hold the logo until the catalog settles: the favicon-guess fallback is
    // only for a REAL catalog miss, never an interim src while the real
    // logoUrl is still in flight (AppLogo shows the letter meanwhile).
    logoUrl: catalog.isFetched ? resolved.logoUrl : "",
  };

  const { states, connect } = useConnectFlow({ agentId });
  // This surface is scoped to ONE toolkit, so it is "connecting" only while its
  // own slug's flow runs — a concurrent connect for a different app never lights
  // this card.
  const connecting = slug in states;
  // The nudge fires at most once per surface, and only for a connection the
  // user drove from HERE — a connection landing via the Integrations tab or
  // another card must not make this one speak.
  const followupFired = useRef(false);

  const startConnect = async () => {
    const outcome = await connect(slug);
    if (outcome !== "active" || followupFired.current) return;
    followupFired.current = true;
    analytics.track("integration_connected", { integration_slug: slug });
    onConnected?.(slug, app.name);
    addToast({
      title: t("composio.verifiedToast", { name: app.name }),
      variant: "success",
    });
  };

  // Stepper mode: an already-connected toolkit shows only a badge, so nothing
  // the user can click ever advances the sequence. Self-report once the status
  // (and the catalog, for a real display name) resolves so the queued answers
  // still get sent. Shares `followupFired` with `startConnect` so a surface can
  // speak at most once. No analytics/toast here: the user connected earlier,
  // this only unblocks the flow.
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
