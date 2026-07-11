import { InteractionFooter } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
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
  /** Fired once when the connection the user drove from here lands — the panel
   *  nudges the agent to resume (reuses the auto-continue path). */
  onConnected: (toolkit: string, appName: string) => void;
  /** Fired when the user skips this connect step (ghost Skip in the footer, live
   *  frontier only). The panel records the skipped app so the composed reply
   *  tells the agent the user declined, then advances the sequence via the api. */
  onSkip: (toolkit: string, appName: string) => void;
  /** The card's shared Back node (previous reached step), or null on step one. */
  back: ReactNode;
  /** Advance toward the frontier past this already-reached step, or null on the
   *  live frontier. Non-null means the step is REVISITED: if it is already
   *  connected this is the only way onward (a filled Forward — its card can't
   *  re-fire onConnected); if it was SKIPPED it renders as a ghost "keep it
   *  skipped" beside a fresh filled Connect, so the user can reconsider. */
  onForward: (() => void) | null;
}

/**
 * The connect-step content for a `request_connection` interaction, rendered
 * INSIDE the shared `ChatInteractionCard` sequence (via its `renderConnect`
 * prop). The interaction card owns the surface, the progress eyebrow, and the
 * TITLE (the step's reason, routed through the shared header, left-aligned like
 * a question). This body is the step's centered identity HERO: the app's brand
 * logo sits BARE and large on top (never boxed into a bordered chip, which reads
 * as a card-inside-a-card), the app name centered beneath it, and one muted line
 * of description centered under that — a composed lockup, not a flat left row.
 * The ONE footer stays the shared right-aligned nav row: shared Back, a ghost
 * Skip on the live frontier (the user may decline; the composed reply tells the
 * agent), and the single filled "Connect" pill.
 *
 * A REVISITED step (`onForward` non-null) the user reached earlier: if it is
 * already connected, the footer shows only a filled Forward (its card can't
 * re-fire onConnected, so that is the way onward) and the hero swaps its
 * description for a calm "Connected" check; if it was SKIPPED, the full
 * actionable state returns — a ghost Forward ("keep it skipped") beside a fresh
 * filled Connect — so the user can reconsider and connect after all.
 *
 * While the OAuth hand-off is in flight the pill shows the connecting state and
 * a quiet muted line reminds the user the browser is waiting. On the live
 * frontier an already-connected toolkit self-reports through `onConnected` (see
 * {@link useIntegrationConnect}) so the sequence never soft-locks.
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  autoGrant,
  onConnected,
  onSkip,
  back,
  onForward,
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  // Auto-continue only on the LIVE frontier (`onForward` null): a revisited
  // completed step (`onForward` non-null) mounts a fresh card whose already-
  // connected self-report would otherwise re-fire — bouncing the user straight
  // off the step they walked Back to and duplicating the reply's "Connected
  // {app}." line. On a revisit the footer's Forward pill is the way onward.
  const revisited = onForward !== null;
  const { app, isConnected, connecting, startConnect } = useIntegrationConnect({
    toolkit,
    agentId,
    autoGrant,
    onConnected,
    autoContinueWhenConnected: !revisited,
  });

  // The filled primary CTA, shown on the frontier and when reconsidering a
  // skipped step. Never rendered beside the filled Forward of a completed
  // revisit (that would be two filled pills).
  const connectButton = (
    <Button
      className="gap-1"
      disabled={connecting}
      onClick={() => void startConnect()}
      size="sm"
      type="button"
    >
      {connecting ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          {t("composio.connecting")}
        </>
      ) : (
        <>
          {t("composio.connect")}
          <ExternalLink className="size-3" />
        </>
      )}
    </Button>
  );

  return (
    <div className="mt-5 flex flex-col">
      {/* Centered identity hero: logo on top, name + description centered
          beneath, generous vertical rhythm so the card reads as composed. */}
      <div className="flex flex-col items-center gap-3 px-2 py-2 text-center">
        <AppLogo display={app} size="xl" />
        <div className="flex min-w-0 flex-col items-center gap-1">
          <span className="max-w-full truncate font-medium text-base text-foreground">
            {app.name}
          </span>
          {isConnected ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 text-xs dark:text-emerald-400">
              <Check className="size-3.5" />
              {t("composio.connected")}
            </span>
          ) : (
            <span className="max-w-full text-muted-foreground text-xs">
              {app.description || t("composio.integration")}
            </span>
          )}
        </div>
        {connecting && (
          <p className="text-muted-foreground text-xs">
            {t("composio.waitingToConnect")}
          </p>
        )}
      </div>

      <InteractionFooter>
        {back}
        {onForward === null ? (
          // Live frontier: ghost Skip (declines this step) beside filled Connect.
          <>
            {!isConnected && (
              <Button
                disabled={connecting}
                onClick={() => onSkip(toolkit, app.name)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("questionCard.skip")}
              </Button>
            )}
            {connectButton}
          </>
        ) : isConnected ? (
          // Revisited + connected: Forward is the only way onward (filled).
          <Button onClick={onForward} size="sm" type="button">
            {t("questionCard.forward")}
          </Button>
        ) : (
          // Revisited + skipped: reconsider — ghost "keep it skipped" Forward
          // beside a fresh filled Connect.
          <>
            <Button
              disabled={connecting}
              onClick={onForward}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("questionCard.forward")}
            </Button>
            {connectButton}
          </>
        )}
      </InteractionFooter>
    </div>
  );
}
