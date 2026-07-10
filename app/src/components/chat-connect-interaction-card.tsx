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
  /** Fired when the user skips this connect step (ghost Skip in the footer).
   *  The panel records the skipped app so the composed reply tells the agent
   *  the user declined, then advances the sequence via the card api. */
  onSkip: (toolkit: string, appName: string) => void;
  /** The card's shared Back node (previous reached step), or null on step one. */
  back: ReactNode;
  /** The card's shared Forward node for a REVISITED, already-connected step
   *  (its card can't re-fire onConnected); rendered INSTEAD of the Connect CTA
   *  when present. Null on the live frontier. */
  forward: ReactNode;
}

/**
 * The connect-step content for a `request_connection` interaction, rendered
 * INSIDE the shared `ChatInteractionCard` sequence (via its `renderConnect`
 * prop). The interaction card owns the surface, the progress eyebrow, and the
 * TITLE (the step's reason, routed through the shared header) — so this body
 * draws NO surface and NO borders of its own: the app's brand logo sits BARE
 * on the card (size-10, its own art carries the brand — never boxed into a
 * bordered chip, which read as a card-inside-a-card), leading the identity
 * stack (name + one-line description). The ONE footer mirrors a question
 * step's grammar exactly: shared Back, a ghost Skip (the user may decline the
 * connection; the composed reply tells the agent), and the single filled
 * "Connect" pill.
 *
 * While the OAuth hand-off is in flight the pill shows the connecting state and
 * a quiet muted line reminds the user the browser is waiting. An already-
 * connected toolkit shows a calm check beside the identity stack and
 * self-reports through `onConnected` (see {@link useIntegrationConnect}) so the
 * sequence never soft-locks with no button to advance it.
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  autoGrant,
  onConnected,
  onSkip,
  back,
  forward,
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  // Auto-continue only on the LIVE frontier: a revisited completed step
  // (`forward` non-null) mounts a fresh card whose already-connected
  // self-report would otherwise re-fire — bouncing the user straight off the
  // step they walked Back to and duplicating the reply's "Connected {app}."
  // line. On a revisit the shared Forward pill is the one way onward.
  const { app, isConnected, connecting, startConnect } = useIntegrationConnect({
    toolkit,
    agentId,
    autoGrant,
    onConnected,
    autoContinueWhenConnected: forward === null,
  });

  return (
    <div className="mt-4 flex flex-col">
      <div className="flex items-center gap-3">
        <AppLogo display={app} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {app.name}
          </span>
          <span className="truncate text-muted-foreground text-xs">
            {app.description || t("composio.integration")}
          </span>
        </div>
        {isConnected && (
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-600 text-xs dark:text-emerald-400">
            <Check className="size-3.5" />
            {t("composio.connected")}
          </span>
        )}
      </div>

      {connecting && (
        <p className="mt-2 text-muted-foreground text-xs">
          {t("composio.waitingToConnect")}
        </p>
      )}

      <InteractionFooter>
        {back}
        {forward ?? (
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
          </>
        )}
      </InteractionFooter>
    </div>
  );
}
