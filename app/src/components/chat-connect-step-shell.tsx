import {
  InlineTextRow,
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
  type StepFooterApi,
} from "@houston-ai/chat";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChatStepDeclineButton } from "./chat-step-decline-button";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

/**
 * The step's free-text, parked by the stepper rather than by the row: what a
 * person typed into a connect / sign-in / credential / hands-on step must
 * survive the card being torn down when they open another mission.
 */
export type StepDraftApi = Pick<StepFooterApi, "draft" | "onDraftChange">;

interface Props extends StepChrome, StepDraftApi {
  /** The step's stable id — fades the modal body on a step swap. */
  stepId: string;
  /** The identity mark left of the title (brand logo, helmet, key glyph). */
  icon: ReactNode;
  /** The step's action, e.g. "Connect Google Sheets" or the integration name. */
  title: ReactNode;
  /** The agent's foreground "why" line; doubles as the collapsed hint. */
  reason: ReactNode;
  /** The step is complete: the footer and the escape row drop, and Enter/Esc go
   *  quiet, so the pager's forward chevron is the only way onward. */
  done: boolean;
  /** The calm Check line a completed step shows in place of its body. Omitted
   *  keeps the body, for a step whose reason still reads as the answer (sign-in
   *  keeps explaining WHOSE identity the agent is now acting under). */
  doneLabel?: string;
  /** Body content under the reason — a muted explainer, a key form, a waiting
   *  line. Shares the body's vertical rhythm; never add a top margin here. */
  children?: ReactNode;
  /** The filled CTA pill. Omitted leaves the decline affordance alone. */
  cta?: ReactNode;
  /** A connect / save / sign-in is in flight: the decline and the escape row go
   *  inert, and Enter/Esc stop firing so nothing races the request. */
  busy: boolean;
  /** Declines the step: no text from the quiet pill, the typed instruction
   *  verbatim from the escape row. */
  onDecline: (message?: string) => void;
  /** Runs on Enter while the step is live. Omitted = Enter does nothing (the
   *  credential step submits its form natively instead). */
  onEnter?: () => void;
  /** False parks the key bindings for a step whose surface isn't the active
   *  view, so a background card can't swallow Enter/Esc. */
  stepActive?: boolean;
}

/**
 * The one shell every "connect something" interaction step renders through:
 * sign-in, app connect, custom credential, and AI-provider connect. They are the
 * same card — an `(icon) action` title lockup, the agent's reason, the quiet
 * decline pill beside a single filled CTA, and a free-text escape row below —
 * differing only in the body they add and the CTA they hand in. Keeping that in
 * four files drifted the family (four spellings of the Check line, three body
 * gaps, four copies of the Enter/Esc lockup); one shell keeps them identical and
 * each card under the size limit.
 *
 * `done` is the single completion contract: a done step drops every way to act
 * on it — footer, escape row, Enter/Esc — so the pager's forward chevron is the
 * only way on, and it shows the calm Check line whenever a `doneLabel` says
 * what landed.
 */
export function ChatConnectStepShell({
  stepId,
  icon,
  title,
  reason,
  done,
  doneLabel,
  children,
  cta,
  busy,
  draft,
  onDraftChange,
  onDecline,
  onEnter,
  stepActive = true,
  pager,
  onDismiss,
  dismissLabel,
  collapseLabel,
  expandLabel,
  disabled,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation("chat");

  // Enter acts, Esc declines — both only while the step is live and idle. The
  // shared hook owns the editable-target guard and the capture-phase pre-emption
  // of the global Escape-closes-the-panel shortcut.
  useInteractionStepKeys({
    enabled: stepActive && open && !busy && !done,
    onEnter,
    onEscape: () => onDecline(),
  });

  return (
    <InteractionModal
      collapseLabel={collapseLabel}
      collapsedHint={reason}
      contentKey={stepId}
      disabled={disabled}
      dismissLabel={dismissLabel}
      expandLabel={expandLabel}
      onDismiss={onDismiss}
      onOpenChange={onOpenChange}
      open={open}
      pager={pager}
      title={
        <InteractionModalTitle className="flex-1 truncate" icon={icon}>
          {title}
        </InteractionModalTitle>
      }
      body={
        done && doneLabel !== undefined ? (
          <span className="inline-flex items-center gap-1 font-medium text-success text-sm">
            <Check className="size-3.5" />
            {doneLabel}
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-balance text-ink text-sm leading-snug">
              {reason}
            </p>
            {children}
          </div>
        )
      }
      footer={
        done ? undefined : (
          <>
            <ChatStepDeclineButton
              disabled={busy}
              escLabel={t("interaction.esc")}
              label={t("interaction.skip")}
              onClick={() => onDecline()}
            />
            {cta}
          </>
        )
      }
      trailing={
        done ? undefined : (
          <InlineTextRow
            disabled={busy}
            // The decline commits nothing, so the step keeps its draft: empty
            // the row here or the text the user already SENT sits in it again
            // when they walk back onto the step.
            onSubmit={(text) => {
              onDecline(text);
              onDraftChange("");
            }}
            onValueChange={onDraftChange}
            placeholder={t("interaction.declinePlaceholder")}
            sendLabel={t("questionCard.send")}
            value={draft}
          />
        )
      }
    />
  );
}
