import {
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
} from "@houston-ai/chat";
import { Button, Kbd } from "@houston-ai/core";
import { Check, CornerDownLeft, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./integrations";
import { useIntegrationConnect } from "./use-integration-connect";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

interface ChatConnectInteractionCardProps extends StepChrome {
  /** The connect step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** The `#houston_toolkit=<slug>` app the agent asked the user to connect. */
  toolkit: string;
  /** Registry provider owning the toolkit (from the connect step; absent on
   *  older interactions = the deployment's active provider). */
  provider?: string;
  /** The agent whose chat hosts the card (multiplayer grant attribution). */
  agentId: string;
  /** Multiplayer: auto-grant the fresh connection to this agent (C4). */
  autoGrant: boolean;
  /** The reason the agent gave for needing this app, rendered as the body's
   *  foreground "why" line beneath the identity row. When absent, it falls back
   *  to a generic "Connect {app} to continue." line. */
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
 * The connect-step content for a `request_connection` interaction, rendered as
 * its OWN `InteractionModal` inside the shared `ChatInteractionCard` sequence
 * (via its `renderConnect` prop, wired with the `StepChrome` the stepper hands
 * it — the header pager + dismiss X). Following the reference "Coworker card"
 * language, the modal TITLE is the identity lockup — the app's real brand logo
 * beside the integration NAME ("Google Sheets") at regular weight — and the body
 * is a two-field block: the agent's REASON ("To create the spreadsheet in your
 * Drive.") in foreground tone (the prominent-but-not-bold "why"), then the app
 * description muted on one truncated line. A right-aligned footer carries the
 * unified quiet "Not now" + Esc hint beside the single filled "Connect" pill
 * (with a return-key glyph).
 *
 * Enter connects, Esc declines (matching the footer hints), both ignored while
 * focus sits in a text field so the real composer is unaffected. The header
 * pager owns Back/Forward, so a REVISITED step needs no navigation button of its
 * own: already connected -> the calm "Connected" state and no footer; skipped ->
 * the Connect CTA (and its paired "Not now") return so the user can reconsider
 * and connect after all. "Not now" travels WITH the Connect CTA so the decline
 * affordance is present wherever connecting is offered — never a dead-end step
 * with only a Connect button.
 *
 * While the OAuth hand-off is in flight the pill shows the connecting state and
 * a quiet line reminds the user the browser is waiting. On the live frontier an
 * already-connected toolkit self-reports through `onConnected` (see {@link
 * useIntegrationConnect}) so the sequence never soft-locks.
 */
export function ChatConnectInteractionCard({
  toolkit,
  provider,
  agentId,
  autoGrant,
  reason,
  onConnected,
  onSkip,
  revisited,
  stepId,
  pager,
  onDismiss,
  dismissLabel,
  disabled,
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  // Auto-continue only on the LIVE frontier: a revisited completed step mounts a
  // fresh card whose already-connected self-report would otherwise re-fire,
  // bouncing the user off the step they walked Back to. On a revisit the pager's
  // forward chevron is the way onward.
  const { app, isConnected, connecting, startConnect } = useIntegrationConnect({
    provider,
    toolkit,
    agentId,
    autoGrant,
    onConnected,
    autoContinueWhenConnected: !revisited,
  });

  // The identity line is the app NAME; the agent's reason becomes the body's
  // foreground "why" line (falling back to a generic connect line).
  const reasonLine =
    reason ?? t("interaction.connectReasonFallback", { app: app.name });

  // The CTA shows whenever the app isn't connected (frontier OR a reconsidered
  // skip). "Not now" travels WITH the CTA: the decline affordance is present
  // wherever connecting is offered, so a revisited/reconsidered step is never a
  // dead end with only a Connect button.
  const showConnect = !isConnected;
  const showNotNow = showConnect;

  // Enter connects (only when the CTA is offered), Esc declines (only when "Not
  // now" is offered) — mirroring the footer hints. Inert while a connect is in
  // flight; the shared hook owns the editable-target guard + capture-phase
  // pre-emption of the global Escape-closes-the-panel shortcut.
  useInteractionStepKeys({
    enabled: !connecting,
    onEnter: showConnect ? () => void startConnect() : undefined,
    onEscape: showNotNow ? () => onSkip(toolkit, app.name) : undefined,
  });

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
    <InteractionModal
      contentKey={stepId}
      disabled={disabled}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      pager={pager}
      // Title: the app icon beside the integration NAME (regular weight), the
      // card's identity line.
      title={
        <InteractionModalTitle
          className="flex-1 truncate"
          icon={<AppLogo className="shrink-0" display={app} size="sm" />}
        >
          {app.name}
        </InteractionModalTitle>
      }
      body={
        <>
          {isConnected ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 text-sm dark:text-emerald-400">
              <Check className="size-3.5" />
              {t("composio.connected")}
            </span>
          ) : (
            // Two-field body: the agent's REASON (foreground "why") over the app
            // description (muted, one truncated line).
            <div className="flex flex-col gap-1">
              <p className="text-balance text-ink text-sm leading-snug">
                {reasonLine}
              </p>
              <p className="truncate text-ink-muted text-sm">
                {app.description || t("composio.integration")}
              </p>
            </div>
          )}
          {connecting && (
            <p className="mt-1.5 text-ink-muted text-xs">
              {t("composio.waitingToConnect")}
            </p>
          )}
        </>
      }
      footer={
        showConnect ? (
          <>
            {showNotNow && (
              <Button
                className="gap-1.5 text-ink-muted"
                disabled={connecting}
                onClick={() => onSkip(toolkit, app.name)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("interaction.skip")}
                <Kbd>{t("interaction.esc")}</Kbd>
              </Button>
            )}
            {connectButton}
          </>
        ) : undefined
      }
    />
  );
}
