import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useComposioApps } from "../hooks/queries";
import { useComposioConnectionWatcher } from "../hooks/use-composio-connection-watcher";
import { useComposioRefetchOnReturn } from "../hooks/use-composio-refetch-on-return";
import { normalizeToolkitSlug } from "../lib/composio-toolkits";
import { useUIStore } from "../stores/ui";
import { analytics } from "../lib/analytics";
import {
  deriveComposioCardView,
  fallbackLogo,
  shouldSendConnectedFollowup,
  type ComposioCardPhase,
} from "./composio-card-state";
import { AppLogo, ComposioStatusSlot } from "./composio-card-visuals";

/**
 * After clicking Connect, the user leaves for the browser to authorize. If
 * nothing has landed within this window we drop the "Connecting…" badge and
 * restore the Connect call-to-action, so the card never shows an eternal
 * spinner for an abandoned or failed flow. The engine-side watch and the
 * ambient connection watcher keep running regardless, so a late connection
 * still flips the card to Connected (and nudges the agent) on its own.
 */
const CONNECTING_TIMEOUT_MS = 90_000;

interface ComposioLinkCardProps {
  toolkit: string;
  /**
   * True if this toolkit is currently connected in the user's Composio
   * account. Resolved from the shared `useConnectedToolkits` query in
   * the parent (chat-tab / board-tab).
   */
  isConnected: boolean;
  /**
   * Default open-URL handler from the chat's link renderer. Called when
   * the user clicks Connect — opens the authorization URL in the
   * system browser.
   */
  onOpen: () => void;
  /**
   * Fired once when a connection the user started from THIS card actually
   * lands. The chat panel uses it to proactively nudge the agent ("I've
   * connected X, please continue") so the task resumes without the user
   * having to type. Optional: surfaces (like onboarding) that don't want a
   * follow-up simply omit it.
   */
  onConnected?: (toolkit: string, appName: string) => void;
}

/**
 * Rich inline card rendered in place of plain markdown links when the
 * agent outputs a Composio connect URL tagged with
 * `#houston_toolkit=<slug>`. Shows the app's logo + name and keeps the
 * connection *status* visually separate from the *action* (issue #379):
 *
 *   - Not connected, idle → a single "Connect" button that opens the OAuth
 *     URL.
 *   - Connecting → a "Connecting…" loading badge plus a distinct arrows
 *     button to re-open the auth flow. Detection is automatic: the engine
 *     watch + ambient watcher invalidate the shared probe query the moment
 *     the connection appears (this card, the Integrations tab, another
 *     agent, the CLI), so there is no manual "I've connected" step.
 *   - Connected → a green "Connected" badge plus the same arrows button to
 *     reconnect.
 */
export function ComposioLinkCard({
  toolkit,
  isConnected,
  onOpen,
  onConnected,
}: ComposioLinkCardProps) {
  const { t } = useTranslation("chat");
  const [phase, setPhase] = useState<ComposioCardPhase>("idle");
  const graceTimer = useRef<number | null>(null);
  // Whether the user started a connect/reconnect from this card. Gates the
  // proactive agent nudge so the card only speaks for connections it drove.
  const hasInitiated = useRef(false);
  // Dedupe guard so the nudge fires at most once per landed connection.
  const followupFired = useRef(false);
  // Previous `isConnected` snapshot, to detect the not-connected → connected
  // edge. Seeded with the mount value so a card that mounts already-connected
  // registers no transition (and therefore no nudge).
  const prevConnected = useRef(isConnected);
  const addToast = useUIStore((s) => s.addToast);
  const { data: apiApps } = useComposioApps();
  const markWaitingForAuth = useComposioRefetchOnReturn();
  // Ambient freshness: while the card shows "not connected", keep the
  // connectedToolkits query honest so the card flips the instant a
  // connection lands via any path (this Connect, Integrations tab,
  // another agent, CLI, stale cache from a prior session).
  useComposioConnectionWatcher(isConnected);

  const app = (() => {
    const fromApi = apiApps?.find((a) => a.toolkit === toolkit);
    if (fromApi) {
      return {
        toolkit: fromApi.toolkit,
        name: fromApi.name,
        description: fromApi.description,
        logoUrl: fromApi.logo_url || fallbackLogo(fromApi.toolkit),
      };
    }
    return {
      toolkit,
      name: toolkit,
      description: t("composio.integration"),
      logoUrl: fallbackLogo(toolkit),
    };
  })();
  const appName = app.name;

  // Watch the real connection status. On the not-connected → connected edge
  // for a connection this card started, nudge the agent and confirm to the
  // user. Always clear the in-flight "connecting" UI once truly connected.
  useEffect(() => {
    const wasConnected = prevConnected.current;
    prevConnected.current = isConnected;

    if (isConnected) {
      if (graceTimer.current !== null) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
      setPhase("idle");
    }

    if (
      shouldSendConnectedFollowup({
        wasConnected,
        isConnected,
        hasInitiated: hasInitiated.current,
        alreadyFired: followupFired.current,
      })
    ) {
      followupFired.current = true;
      analytics.track("integration_connected", {
        integration_slug: normalizeToolkitSlug(toolkit),
      });
      onConnected?.(toolkit, appName);
      addToast({
        title: t("composio.verifiedToast", { name: appName }),
        variant: "success",
      });
    }
  }, [isConnected, toolkit, appName, onConnected, addToast, t]);

  // Always clean up the grace timer on unmount so it never fires
  // against a dead component.
  useEffect(() => {
    return () => {
      if (graceTimer.current !== null) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, []);

  // Single entry point for both the Connect CTA and the arrows reconnect
  // button: open the auth URL, arm the watchers, and show "Connecting…"
  // while we wait for detection.
  const startConnect = useCallback(() => {
    hasInitiated.current = true;
    setPhase("connecting");
    markWaitingForAuth(toolkit);
    onOpen();
    if (graceTimer.current !== null) window.clearTimeout(graceTimer.current);
    graceTimer.current = window.setTimeout(() => {
      setPhase((p) => (p === "connecting" ? "idle" : p));
      graceTimer.current = null;
    }, CONNECTING_TIMEOUT_MS);
  }, [onOpen, markWaitingForAuth, toolkit]);

  const view = deriveComposioCardView(isConnected, phase);

  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex items-center gap-3 px-3 py-2.5 rounded-xl border border-black/5 bg-background min-w-0">
        <AppLogo app={app} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[13px] font-medium text-foreground truncate">
            {app.name}
          </span>
          <span className="text-[11px] text-muted-foreground truncate">
            {isConnected ? t("composio.alreadyConnected") : app.description}
          </span>
        </span>
        <ComposioStatusSlot view={view} onConnect={startConnect} />
      </span>
    </span>
  );
}
