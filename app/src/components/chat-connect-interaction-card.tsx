import { InteractionFooter } from "@houston-ai/chat";
import { Button, Kbd } from "@houston-ai/core";
import { Check, CornerDownLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./integrations";
import { useIntegrationConnect } from "./use-integration-connect";

interface ChatConnectInteractionCardProps {
  /** The `#houston_toolkit=<slug>` app the agent asked the user to connect. */
  toolkit: string;
  /** The agent whose chat hosts the card (multiplayer grant attribution). */
  agentId: string;
  /** Multiplayer: auto-grant the fresh connection to this agent (C4). */
  autoGrant: boolean;
  /** The reason the agent gave for needing this app, routed into the card's bold
   *  title. When absent, the title falls back to "Connect {app}?". */
  reason?: string;
  /** Fired once when the connection the user drove from here lands — the panel
   *  nudges the agent to resume (reuses the auto-continue path). */
  onConnected: (toolkit: string, appName: string) => void;
  /** Fired when the user declines this connect step ("Not now", live frontier
   *  only). The panel records the skip so the composed reply tells the agent the
   *  user declined, then advances the sequence. */
  onSkip: (toolkit: string, appName: string) => void;
  /** True when the user walked BACK onto this already-reached step via the pager.
   *  A revisited step that is already connected shows the calm connected state
   *  with no footer (the pager's forward chevron is the way onward); a revisited
   *  step that was SKIPPED keeps its Connect CTA so the user can reconsider. */
  revisited: boolean;
}

/**
 * The connect-step content for a `request_connection` interaction, rendered
 * INSIDE the shared `ChatInteractionCard` sequence (via its `renderConnect`
 * prop). Following the reference "Coworker card" language, this is a COMPACT
 * left-aligned lockup: the app's real brand logo sits inline with a bold title
 * (the agent's reason, or "Connect {app}?"), one muted line of benefit
 * underneath, and a right-aligned footer of a quiet "Not now" + Esc hint beside
 * the single filled "Connect" pill (with a return-key glyph). This REVERSES the
 * earlier centered identity hero — the references are compact and left-aligned.
 *
 * Enter connects, Esc declines (matching the footer hints), both ignored while
 * focus sits in a text field so the real composer is unaffected. The header
 * pager owns Back/Forward, so a REVISITED step needs no navigation button of its
 * own: already connected -> the calm "Connected" state and no footer; skipped ->
 * the Connect CTA returns so the user can reconsider and connect after all.
 *
 * While the OAuth hand-off is in flight the pill shows the connecting state and
 * a quiet line reminds the user the browser is waiting. On the live frontier an
 * already-connected toolkit self-reports through `onConnected` (see {@link
 * useIntegrationConnect}) so the sequence never soft-locks.
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  autoGrant,
  reason,
  onConnected,
  onSkip,
  revisited,
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  // Auto-continue only on the LIVE frontier: a revisited completed step mounts a
  // fresh card whose already-connected self-report would otherwise re-fire,
  // bouncing the user off the step they walked Back to. On a revisit the pager's
  // forward chevron is the way onward.
  const { app, isConnected, connecting, startConnect } = useIntegrationConnect({
    toolkit,
    agentId,
    autoGrant,
    onConnected,
    autoContinueWhenConnected: !revisited,
  });

  const title = reason ?? t("interaction.connectTitle", { app: app.name });

  // The CTA shows whenever the app isn't connected (frontier OR a reconsidered
  // skip); "Not now" only on the live frontier (a revisited skip keeps itself
  // skipped via the pager's forward chevron, so it needs no decline button).
  const showConnect = !isConnected;
  const showNotNow = !revisited && !isConnected;

  // Enter connects, Esc declines — mirroring the footer's return glyph + Esc
  // hint. Ignored while typing in a field so the real composer keeps its keys.
  // Runs in the CAPTURE phase and stops the event dead when it acts, so Esc
  // decides "not now" here instead of falling through to the global
  // Escape-closes-the-panel shortcut (use-keyboard-shortcuts.ts).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (isEditable || connecting) return;
      if (e.key === "Enter" && showConnect) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void startConnect();
      } else if (e.key === "Escape" && showNotNow) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onSkip(toolkit, app.name);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    connecting,
    showConnect,
    showNotNow,
    startConnect,
    onSkip,
    toolkit,
    app.name,
  ]);

  const connectButton = (
    <Button
      className="gap-1.5"
      disabled={connecting}
      onClick={() => void startConnect()}
      size="sm"
      type="button"
    >
      {connecting ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {t("composio.connecting")}
        </>
      ) : (
        <>
          {t("composio.connect")}
          <CornerDownLeft className="size-3.5 opacity-70" />
        </>
      )}
    </Button>
  );

  return (
    <div className="mt-4 flex flex-col">
      {/* Compact left-aligned identity lockup: logo inline with the bold title,
          one muted benefit line beneath. */}
      <div className="flex items-center gap-3">
        <AppLogo className="shrink-0" display={app} size="sm" />
        <span className="min-w-0 flex-1 text-balance font-semibold text-base text-foreground leading-snug">
          {title}
        </span>
      </div>
      {isConnected ? (
        <span className="mt-1.5 inline-flex items-center gap-1 font-medium text-emerald-600 text-sm dark:text-emerald-400">
          <Check className="size-3.5" />
          {t("composio.connected")}
        </span>
      ) : (
        <p className="mt-1.5 truncate text-muted-foreground text-sm">
          {app.description || t("composio.integration")}
        </p>
      )}
      {connecting && (
        <p className="mt-1 text-muted-foreground text-xs">
          {t("composio.waitingToConnect")}
        </p>
      )}

      {showConnect && (
        <InteractionFooter>
          {showNotNow && (
            <Button
              className="gap-1.5 text-muted-foreground"
              disabled={connecting}
              onClick={() => onSkip(toolkit, app.name)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("interaction.notNow")}
              <Kbd>{t("interaction.esc")}</Kbd>
            </Button>
          )}
          {connectButton}
        </InteractionFooter>
      )}
    </div>
  );
}
