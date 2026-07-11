import { InteractionFooter } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ConnectAppLogo,
  useIntegrationConnect,
} from "./use-integration-connect";

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
 * draws NO surface of its own: just a hairline Mercury row (the app's logo +
 * name + one-line description, the SAME grammar as a question's option rows) and
 * the ONE footer, where a single filled "Connect" pill sits beside the shared
 * Back node exactly like a question step's Next. No card-inside-a-card.
 *
 * While the OAuth hand-off is in flight the pill shows the connecting state and
 * a quiet muted line reminds the user the browser is waiting. An already-
 * connected toolkit shows a calm check in the row and self-reports through
 * `onConnected` (see {@link useIntegrationConnect}) so the sequence never
 * soft-locks with no button to advance it.
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  autoGrant,
  onConnected,
  back,
  forward,
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  const { app, displayName, isConnected, connecting, startConnect } =
    useIntegrationConnect({
      toolkit,
      agentId,
      autoGrant,
      onConnected,
      autoContinueWhenConnected: true,
    });

  return (
    <div className="mt-4 flex flex-col">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 px-3.5 py-3">
        <ConnectAppLogo name={displayName} logoUrl={app.logoUrl} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {displayName}
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
        )}
      </InteractionFooter>
    </div>
  );
}
