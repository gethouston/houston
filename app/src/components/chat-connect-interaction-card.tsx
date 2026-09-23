import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { AppLogo } from "./integrations";
import { CuratedConnectDialog } from "./integrations/curated-connect-dialog";
import { useChatConnect } from "./use-chat-connect";

interface ChatConnectInteractionCardProps extends StepChrome, StepDraftApi {
  /** The connect step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** The `#houston_toolkit=<slug>` app the agent asked the user to connect. */
  toolkit: string;
  /** The agent whose chat hosts the card. */
  agentId: string;
  accountScope?: boolean;
  /** The reason the agent gave for needing this app, rendered as the body's
   *  foreground "why" line beneath the identity row. When absent, it falls back
   *  to a generic "Connect {app} to continue." line. */
  reason?: string;
  /** Fired once when the connection the user drove from here lands — the panel
   *  nudges the agent to resume (reuses the auto-continue path). */
  onConnected: (toolkit: string, appName: string) => void;
  /** Fired when the user declines this connect step: "Not now" (live frontier
   *  only) passes no `message`; typing an instruction into the free-text row and
   *  sending passes that verbatim text. The panel records the decline (with the
   *  message, if any, so the composed reply relays it) then advances. */
  onSkip: (toolkit: string, appName: string, message?: string) => void;
  /** True when the user walked BACK onto this already-reached step via the pager.
   *  A revisited step that is already connected shows the calm connected state
   *  with no footer (the pager's forward chevron is the way onward); a revisited
   *  step that was SKIPPED keeps its Connect CTA so the user can reconsider. */
  revisited: boolean;
}

/**
 * The connect-step content for a `request_connection` interaction, rendered
 * through the shared {@link ChatConnectStepShell} inside the `ChatInteractionCard`
 * sequence (via its `renderConnect` prop, wired with the `StepChrome` the stepper
 * hands it — the header pager + dismiss X). The TITLE is the app's real brand
 * logo beside the explicit action, "Connect Google Sheets"; the body carries the
 * agent's REASON ("To create the spreadsheet in your Drive.") in foreground tone;
 * the footer pairs the unified quiet decline with the single filled "Connect"
 * pill (with a return-key glyph).
 *
 * Enter connects, Esc declines. A connected step shows the calm "Connected" line
 * with no way to act on it, so the pager's forward chevron is the way onward; a
 * SKIPPED step the user walks back to keeps its Connect CTA so they can
 * reconsider — never a dead-end step.
 *
 * While the OAuth hand-off is in flight the pill shows the connecting state and
 * a quiet line reminds the user the browser is waiting. On the live frontier an
 * already-connected toolkit self-reports through `onConnected` (see {@link
 * useIntegrationConnect}) so the sequence never soft-locks.
 */
export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  accountScope,
  reason,
  onConnected,
  onSkip,
  revisited,
  stepId,
  ...chrome
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  // Auto-continue only on the LIVE frontier: a revisited completed step mounts a
  // fresh card whose already-connected self-report would otherwise re-fire,
  // bouncing the user off the step they walked Back to. On a revisit the pager's
  // forward chevron is the way onward.
  const {
    app,
    isConnected,
    connecting,
    startConnect,
    curatedDialog,
    curatedProviderConnect,
    closeCuratedDialog,
  } = useChatConnect({
    toolkit,
    agentId,
    accountScope,
    onConnected,
    autoContinueWhenConnected: !revisited,
  });

  return (
    <>
      {/* A curated toolkit's Connect opens the options dialog (provider
          connect / MCP sign-in / API key) instead of the generic hand-off. */}
      <CuratedConnectDialog
        agentId={agentId}
        curated={curatedDialog}
        providerConnect={curatedProviderConnect}
        onClose={closeCuratedDialog}
      />
      <ChatConnectStepShell
        {...chrome}
        busy={connecting}
        cta={
          isConnected ? undefined : (
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
          )
        }
        done={isConnected}
        doneLabel={t("composio.connected")}
        icon={<AppLogo className="shrink-0" display={app} size="sm" />}
        onDecline={(text) => onSkip(toolkit, app.name, text)}
        onEnter={() => void startConnect()}
        // The title names the required action; the agent's reason explains why.
        reason={
          reason ?? t("interaction.connectReasonFallback", { app: app.name })
        }
        stepId={stepId}
        title={t("interaction.connectTitle", { app: app.name })}
      >
        {connecting && (
          <p className="text-ink-muted text-xs">
            {t("composio.waitingToConnect")}
          </p>
        )}
      </ChatConnectStepShell>
    </>
  );
}
