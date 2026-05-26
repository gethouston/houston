import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useComposioApps } from "../hooks/queries";
import { useComposioConnectionWatcher } from "../hooks/use-composio-connection-watcher";
import { useComposioRefetchOnReturn } from "../hooks/use-composio-refetch-on-return";
import {
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
} from "../lib/composio-toolkits";
import { queryKeys } from "../lib/query-keys";
import { useUIStore } from "../stores/ui";
import { analytics } from "../lib/analytics";

/**
 * After clicking Connect, the user goes to the browser to authorize.
 * This is how long we leave the spinner up before flipping to a
 * manual "I've connected" button. Short enough that a stuck card
 * recovers quickly; long enough to cover the typical OAuth round-trip
 * + Composio backend propagation when the engine-side watcher catches
 * the event for us.
 */
const OPENING_GRACE_MS = 6_000;

type Phase = "idle" | "opening" | "verify" | "verifying";

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
}

/**
 * Rich inline card rendered in place of plain markdown links when the
 * agent outputs a Composio connect URL tagged with
 * `#houston_toolkit=<slug>`. Shows the app's logo + name and reflects
 * live connection state:
 *
 *   - Connected → green "Connected" pill, click is a no-op
 *   - Not connected → "Connect" button that opens the OAuth URL and,
 *     when the Houston window regains focus (user returned from the
 *     browser), invalidates the probe query so the card flips to
 *     Connected. OAuth flows vary from 5s to 60s+ so a fixed timeout
 *     would always be wrong — focus-driven invalidation updates
 *     precisely when the user looks at the card.
 */
export function ComposioLinkCard({
  toolkit,
  isConnected,
  onOpen,
}: ComposioLinkCardProps) {
  const { t } = useTranslation("chat");
  const [phase, setPhase] = useState<Phase>("idle");
  const graceTimer = useRef<number | null>(null);
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const { data: apiApps } = useComposioApps();
  const markWaitingForAuth = useComposioRefetchOnReturn();
  // Ambient freshness: while the card shows "not connected", keep the
  // connectedToolkits query honest so the card flips the instant a
  // connection lands via any path (this Connect, Integrations tab,
  // another agent, CLI, stale cache from a prior session).
  useComposioConnectionWatcher(isConnected);

  // Once the probe comes back connected, drop any local intermediate
  // state — the parent owns the visual now.
  useEffect(() => {
    if (isConnected) {
      setPhase("idle");
      if (graceTimer.current !== null) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    }
  }, [isConnected]);

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

  const handleConnect = useCallback(() => {
    setPhase("opening");
    markWaitingForAuth(toolkit);
    onOpen();
    // After the grace window, hand control to the user. The engine
    // watcher and the ambient connection watcher are both still
    // running; if a connection lands while we're in `verify` state,
    // the parent's `isConnected` will flip and the effect above
    // resets the phase.
    if (graceTimer.current !== null) window.clearTimeout(graceTimer.current);
    graceTimer.current = window.setTimeout(() => {
      setPhase((p) => (p === "opening" ? "verify" : p));
      graceTimer.current = null;
    }, OPENING_GRACE_MS);
  }, [onOpen, markWaitingForAuth, toolkit]);

  const handleVerify = useCallback(async () => {
    setPhase("verifying");
    // Hard refresh: cancel anything in flight so a stale "[]" can't
    // race past us, force the registered query to refetch, then read
    // the freshly-written cache. We don't trust the cached
    // `isConnected` prop here — the user explicitly asked us to
    // re-check.
    await qc.cancelQueries({ queryKey: queryKeys.connectedToolkits() });
    await qc.refetchQueries({
      queryKey: queryKeys.connectedToolkits(),
      type: "active",
    });
    const target = normalizeToolkitSlug(toolkit);
    const fresh = normalizeToolkitSlugs(
      qc.getQueryData<string[]>(queryKeys.connectedToolkits()) ?? [],
    );
    const connected = fresh.includes(target);
    if (connected) {
      analytics.track("integration_connected", { integration_slug: target });
      addToast({
        title: t("composio.verifiedToast", { name: app.name }),
        variant: "success",
      });
      // Parent's isConnected will flip on the next render; effect
      // above resets phase to idle.
    } else {
      addToast({
        title: t("composio.notVerified"),
        variant: "info",
      });
      setPhase("verify");
    }
  }, [qc, toolkit, addToast, t, app.name]);

  const renderRightSlot = () => {
    if (isConnected) {
      return (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium shrink-0">
          <Check className="size-3" />
          {t("composio.connected")}
        </span>
      );
    }
    if (phase === "opening") {
      return (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium opacity-50 shrink-0"
        >
          <Loader2 className="size-3 animate-spin" />
        </button>
      );
    }
    if (phase === "verify" || phase === "verifying") {
      return (
        <button
          type="button"
          onClick={phase === "verifying" ? undefined : handleVerify}
          disabled={phase === "verifying"}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-secondary text-foreground text-xs font-medium hover:bg-black/[0.05] transition-colors duration-200 disabled:opacity-50 shrink-0"
        >
          {phase === "verifying" ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              {t("composio.verifying")}
            </>
          ) : (
            <>
              <RefreshCw className="size-3" />
              {t("composio.verify")}
            </>
          )}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleConnect}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity duration-200 shrink-0"
      >
        {t("composio.connect")}
        <ExternalLink className="size-3" />
      </button>
    );
  };

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
        {renderRightSlot()}
      </span>
    </span>
  );
}

function AppLogo({ app }: { app: { name: string; logoUrl: string } }) {
  const [imgError, setImgError] = useState(false);
  const initial = app.name.charAt(0).toUpperCase();
  if (imgError) {
    return (
      <span className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">
          {initial}
        </span>
      </span>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt={app.name}
      className="size-8 rounded-lg object-contain shrink-0"
      onError={() => setImgError(true)}
    />
  );
}

/**
 * Parse a Composio redirect URL for the `#houston_toolkit=<slug>`
 * fragment that agents append per the system prompt. Returns the slug
 * or `null` if the URL doesn't carry one.
 */
export function parseComposioToolkitFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const slug = params.get("houston_toolkit");
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}
