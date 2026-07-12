import {
  humanizeActionSlug,
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
} from "@houston-ai/chat";
import { Button, Kbd } from "@houston-ai/core";
import { Check, CornerDownLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApprovalCardParams } from "./approval-card-params";
import { AppLogo } from "./integrations";
import { useIntegrationAppDisplay } from "./use-integration-app-display";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

interface ChatApprovalInteractionCardProps extends StepChrome {
  /** The approval step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** Lowercase toolkit slug, e.g. "gmail" — resolves the app identity lockup. */
  toolkit: string;
  /** The raw Composio action slug, e.g. "GMAIL_SEND_DRAFT", humanized for the
   *  permission question ("send draft"). */
  action: string;
  /** Display-ready key/values rendered as the card's param rows. */
  params?: Record<string, string>;
  /** How many params were dropped past the row cap (present only when > 0); the
   *  card shows a muted "+N more" line so the user knows the approval covers
   *  settings the rows don't show. */
  paramsOmitted?: number;
  /** True when the user walked BACK onto this already-reached step via the pager. */
  revisited: boolean;
  /** The outcome already recorded for this step (walking Back onto a resolved
   *  step shows the calm decided state instead of re-offering the buttons). */
  outcome?: "allowedOnce" | "alwaysAllowed" | "denied";
  /** Fired with the decision; the panel records it, performs the store write,
   *  and advances the stepper. */
  onDecision: (decision: "allowOnce" | "alwaysAllow" | "deny") => void;
}

/**
 * The approval-step content for an `approval` interaction, rendered as its OWN
 * `InteractionModal` inside the shared `ChatInteractionCard` sequence (via its
 * `renderApproval` prop, wired with the `StepChrome` the stepper hands it — the
 * header pager + dismiss X). A tool call needs the user's go-ahead before it
 * runs, so the host queued this step; the card asks the permission question and
 * records the answer.
 *
 * Following the reference "Coworker card" language, the modal TITLE is the app
 * identity lockup — the real brand logo beside the integration NAME at regular
 * weight — over a body that leads with the permission question ("Allow Gmail to
 * send draft?") in foreground tone, then the tool's params as a two-column
 * key/value block (muted label, foreground value).
 *
 * THREE decisions, all made from the footer:
 *   - "Allow once"    — run this call, ask again next time (Enter).
 *   - "Always allow"  — run it and stop asking for this action (pushed LEFT).
 *   - "Deny"          — decline this call; the model hears the refusal (Esc).
 * Every choice resolves the step, so the app records which decision before
 * advancing. Esc = Deny (NOT skip): declining here is a real decision the model
 * is told about, unlike a connect/signin "Not now" that merely defers. Enter =
 * Allow once mirrors the footer's return-key glyph (both wired through the shared
 * {@link useInteractionStepKeys}, which owns the text-field guard + capture-phase
 * pre-emption of the global Escape-closes-the-panel shortcut).
 *
 * The header X (dismiss) is NOT a Deny — it interrupts the WHOLE interaction
 * sequence (handled by the stepper), leaving this call unanswered rather than
 * refused. The header pager owns Back/Forward, so a REVISITED step that is
 * already decided shows the calm decided state (a check + "Allowed", or a muted
 * "Denied") with no footer; the pager's forward chevron is the way onward.
 */
export function ChatApprovalInteractionCard({
  toolkit,
  action,
  params,
  paramsOmitted,
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

  // The app identity for the title lockup (name + logo), resolved WITHOUT any
  // connect side effects — the approval card shows the app but never starts OAuth.
  const app = useIntegrationAppDisplay(toolkit);

  // A revisited step that was already decided shows the calm decided state and
  // no footer; the pager's forward chevron is the way onward. The decision
  // buttons only offer on the live frontier.
  const decided = revisited && outcome != null;

  // Enter allows once, Esc denies — mirroring the footer's return glyph + Esc
  // hint. Inert once the step is decided or the card is disabled (the shared
  // hook owns the editable-target guard + capture-phase pre-emption).
  useInteractionStepKeys({
    enabled: !disabled && !decided,
    onEnter: () => onDecision("allowOnce"),
    onEscape: () => onDecision("deny"),
  });

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
        <div className="flex flex-col">
          {/* The permission question, the prominent regular-weight line. */}
          <p className="text-balance text-foreground text-sm leading-snug">
            {t("interaction.approvalTitle", {
              app: app.name,
              action: humanizeActionSlug(action, toolkit),
            })}
          </p>
          <ApprovalCardParams params={params} paramsOmitted={paramsOmitted} />
          {decided &&
            (outcome === "denied" ? (
              // Denied: a muted line, no check, no red — a calm decision record.
              <span className="mt-3 text-muted-foreground text-sm">
                {t("interaction.approvalDenied")}
              </span>
            ) : (
              // Allowed (once or always): the connect card's decided-state tone.
              <span className="mt-3 inline-flex items-center gap-1 font-medium text-emerald-600 text-sm dark:text-emerald-400">
                <Check className="size-3.5" />
                {t("interaction.approvalAllowed")}
              </span>
            ))}
        </div>
      }
      footer={
        decided ? undefined : (
          <>
            <Button
              className="mr-auto"
              disabled={disabled}
              onClick={() => onDecision("alwaysAllow")}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("interaction.alwaysAllow")}
            </Button>
            <Button
              className="gap-1.5"
              disabled={disabled}
              onClick={() => onDecision("deny")}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("interaction.deny")}
              <Kbd>{t("interaction.esc")}</Kbd>
            </Button>
            <Button
              className="gap-1.5"
              disabled={disabled}
              onClick={() => onDecision("allowOnce")}
              size="sm"
              type="button"
            >
              {t("interaction.allowOnce")}
              <CornerDownLeft className="size-3.5 opacity-70" />
            </Button>
          </>
        )
      }
    />
  );
}
