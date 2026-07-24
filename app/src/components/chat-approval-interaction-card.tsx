import {
  humanizeActionSlug,
  InlineTextRow,
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
} from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, CornerDownLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChatStepDeclineButton } from "./chat-step-decline-button";
import { AppLogo } from "./integrations";
import { useIntegrationAppDisplay } from "./use-integration-app-display";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

/** The user's answer: go ahead, not now, or a redirection with the verbatim
 *  text of what to do differently. */
export type ApprovalDecision =
  | "doIt"
  | "notNow"
  | { kind: "differently"; text: string };

interface ChatApprovalInteractionCardProps extends StepChrome {
  /** The approval step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** Lowercase toolkit slug, e.g. "gmail" — resolves the app identity lockup. */
  toolkit: string;
  /** The raw Composio action slug, e.g. "GMAIL_SEND_EMAIL", humanized for the
   *  fallback confirmation question. */
  action: string;
  /** The agent-phrased confirmation ("Should I send the 30 invites?"). When
   *  present it IS the body question; absent falls back to "{{action}} with
   *  {{app}}?". */
  intent?: string;
  /** True when the user walked BACK onto this already-reached step. */
  revisited: boolean;
  /** The decision already recorded for this step (a revisit shows the calm
   *  decided state instead of re-offering the controls). */
  outcome?: "doIt" | "notNow" | "differently";
  /** Fired with the decision; the panel records it, grants the action on "Do
   *  it", and advances the stepper. */
  onDecision: (decision: ApprovalDecision) => void;
}

/**
 * The confirmation content for an `approval` interaction, rendered as its OWN
 * `InteractionModal` inside the shared `ChatInteractionCard` sequence (via its
 * `renderApproval` prop + the `StepChrome` the stepper hands it). A queued tool
 * call needs the user's go-ahead; the card asks a plain, non-technical
 * confirmation and records the answer.
 *
 * TITLE: the app lockup (logo + NAME). BODY: the QUESTION (the agent's `intent`,
 * else the "{{action}} with {{app}}?" fallback) over an always-visible free-text
 * row; raw params are NEVER shown. Three answers: "Do it" (Enter) grants the
 * action and resumes; "Not now" (Esc) declines; typing + send is "differently"
 * (the model gets the verbatim ask, no host write). Enter/Esc ride {@link
 * useInteractionStepKeys}, whose guard keeps Enter inside the row on its own
 * submit. The header X is a Stop, not a "Not now". A REVISITED decided step
 * shows the calm state (check + "Confirmed", or muted "Not now" / "Changed").
 */
export function ChatApprovalInteractionCard({
  toolkit,
  action,
  intent,
  revisited,
  outcome,
  onDecision,
  stepId,
  pager,
  onDismiss,
  dismissLabel,
  disabled,
}: ChatApprovalInteractionCardProps) {
  const { t } = useTranslation("chat");

  // The app identity for the title lockup, resolved WITHOUT connect side effects
  // — the card shows the app but never starts OAuth.
  const app = useIntegrationAppDisplay(toolkit);

  // A revisited, already-decided step shows the calm decided state and no footer;
  // the controls only offer on the live frontier.
  const decided = revisited && outcome != null;

  // Enter confirms, Esc declines — mirroring the footer hints. Inert once decided
  // or disabled; the shared hook's editable-target guard keeps Enter inside the
  // redirection row on its own submit and pre-empts the global Escape shortcut.
  useInteractionStepKeys({
    enabled: !disabled && !decided,
    onEnter: () => onDecision("doIt"),
    onEscape: () => onDecision("notNow"),
  });

  const question =
    intent ??
    t("interaction.confirmFallback", {
      app: app.name,
      action: humanizeActionSlug(action, toolkit),
    });

  return (
    <InteractionModal
      contentKey={stepId}
      disabled={disabled}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      pager={pager}
      title={
        <InteractionModalTitle
          className="flex-1 truncate"
          icon={<AppLogo className="shrink-0" display={app} size="sm" />}
        >
          {app.name}
        </InteractionModalTitle>
      }
      body={
        <div className="flex flex-col">
          {/* The confirmation question, the prominent regular-weight line. */}
          <p className="text-balance text-ink text-sm leading-snug">
            {question}
          </p>
          {decided ? (
            outcome === "doIt" ? (
              // Confirmed: the calm decided-state tone shared with connect.
              <span className="mt-3 inline-flex items-center gap-1 font-medium text-emerald-600 text-sm dark:text-emerald-400">
                <Check className="size-3.5" />
                {t("interaction.confirmed")}
              </span>
            ) : (
              // Not now / Changed: a muted decision record, no check.
              <span className="mt-3 text-ink-muted text-sm">
                {t(
                  outcome === "notNow"
                    ? "interaction.notNow"
                    : "interaction.changed",
                )}
              </span>
            )
          ) : (
            <InlineTextRow
              disabled={disabled ?? false}
              onSubmit={(text) => onDecision({ kind: "differently", text })}
              placeholder={t("interaction.differentlyPlaceholder")}
              sendLabel={t("questionCard.send")}
            />
          )}
        </div>
      }
      footer={
        decided ? undefined : (
          <>
            <ChatStepDeclineButton
              escLabel={t("interaction.esc")}
              label={t("interaction.notNow")}
              onClick={() => onDecision("notNow")}
              variant="outline"
            />
            <Button
              className="gap-1.5"
              disabled={disabled}
              onClick={() => onDecision("doIt")}
              size="sm"
              type="button"
            >
              {t("interaction.doIt")}
              <CornerDownLeft className="size-3.5 opacity-70" />
            </Button>
          </>
        )
      }
    />
  );
}
