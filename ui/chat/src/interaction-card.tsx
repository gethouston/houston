"use client";

import { cn } from "@houston-ai/core";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  advanceConnect,
  advanceSignin,
  answerWithOption,
  answerWithText,
  type ChatInteractionAnswer,
  type ChatInteractionStep,
  canGoForward,
  defaultProgress,
  draftFor,
  goBack,
  goForward,
  hasSelectableOptions,
  initialStepperState,
  selectedOptionId,
  setDraft,
  skipStep,
  type Transition,
} from "./interaction-card-logic";
import {
  FreeTextRow,
  OptionRow,
  StepperHeader,
} from "./interaction-card-parts";

export type {
  ChatInteractionAnswer,
  ChatInteractionOption,
  ChatInteractionStep,
} from "./interaction-card-logic";

type ConnectStep = Extract<ChatInteractionStep, { kind: "connect" }>;
type SigninStep = Extract<ChatInteractionStep, { kind: "signin" }>;

export interface ChatInteractionCardProps {
  /** The ordered interaction steps: question steps, then at most one signin
   *  step, then connect steps (>=1 total). */
  steps: ChatInteractionStep[];
  /** Receives every question answer, in step order, once the last step is done. */
  onComplete: (answers: ChatInteractionAnswer[]) => void;
  /** Renders a connect step's icon+title lockup, description, AND footer CTA;
   *  call `api.onConnected` to advance once the connection lands. ui/chat stays
   *  Composio-unaware, so the app supplies the reactive connect content and its
   *  own title. Step-to-step navigation is NOT the body's concern — the header
   *  pager owns Back/Forward for every kind. See {@link StepFooterApi}. */
  renderConnect: (
    step: ConnectStep,
    api: StepFooterApi & { onConnected: () => void },
  ) => ReactNode;
  /** Renders a signin step's icon+title lockup, description, AND footer CTA;
   *  call `api.onSignedIn` to advance. ui/chat stays auth-unaware, so the app
   *  supplies the reactive sign-in content and its own title. See {@link
   *  StepFooterApi}. */
  renderSignin: (
    step: SigninStep,
    api: StepFooterApi & { onSignedIn: () => void },
  ) => ReactNode;
  /** Dismisses the WHOLE interaction sequence. When omitted, the header shows no
   *  dismiss (X) button. */
  onDismiss?: () => void;
  disabled?: boolean;
  labels?: {
    /** Free-text answer field on a free-text-only question (no options). */
    placeholder?: string;
    /** Free-text ESCAPE row placeholder, shown when the question also offers
     *  options ("None of these..."). Falls back to `placeholder`. */
    escapePlaceholder?: string;
    /** The row Skip pill (question) and the signin/connect "Not now" wording. */
    skip?: string;
    /** aria-label of the pager's back chevron. */
    back?: string;
    /** aria-label of the pager's forward chevron. */
    forward?: string;
    dismiss?: string;
    /** The soft "Recommended" chip beside a marked option's label. */
    recommended?: string;
    /** Pager progress copy, e.g. "1 of 3" (shown for a multi-step sequence). */
    progress?: (current: number, total: number) => string;
  };
}

/** The step-scoped api the card hands a signin/connect body. Navigation is NOT
 *  here — the header pager owns Back/Forward for every step kind. The body only
 *  needs:
 *  - `revisited`: true when the user walked BACK onto this already-reached step
 *    (via the pager). The body then suppresses the frontier-only "Not now"; if
 *    the step is already completed it also drops its CTA (the pager's forward
 *    chevron is the way onward), and if it was SKIPPED it keeps the CTA so the
 *    user can reconsider and complete it after all.
 *  - `onSkip`: decline this step WITHOUT completing it (live frontier only),
 *    recording the skip so the composed reply tells the agent the user declined. */
export interface StepFooterApi {
  revisited: boolean;
  onSkip: () => void;
}

/**
 * The in-chat surface shown when the agent pauses to gather what it needs before
 * continuing: a stepper that walks the user through ONE step at a time (question,
 * signin, or connect). It follows the reference "Coworker card" language — a
 * white card with a hairline border and roomy padding, a bold left title, and a
 * top-right cluster of the compact `‹ N of M ›` pager (whose chevrons ARE the
 * Back/Forward navigation, hidden for a lone step) plus a dismiss X.
 *
 * A question step renders its option rows (LEFT number badge that doubles as the
 * keyboard shortcut, bold label, optional Recommended chip, muted inline
 * description) followed by the free-text ESCAPE row (pencil badge, muted
 * placeholder, inline Skip pill). Clicking an option answers and advances;
 * typing + Enter submits; the Skip pill skips. There is NO separate footer — the
 * actions live in the rows and the pager.
 *
 * A signin/connect step's reactive body (icon+title lockup, description, filled
 * CTA + "Not now" footer) is app-supplied via `renderSignin` / `renderConnect`,
 * so the card stays Composio/auth-unaware; the card still owns the surface and
 * the pager. It renders ABOVE the real composer (which the caller keeps mounted
 * alongside it) — typing directly into that composer is the caller's implicit
 * abandon of this card.
 */
export function ChatInteractionCard({
  steps,
  onComplete,
  renderConnect,
  renderSignin,
  onDismiss,
  disabled = false,
  labels,
}: ChatInteractionCardProps) {
  const [state, setState] = useState(initialStepperState);

  const total = steps.length;
  const current = Math.min(state.current, total - 1);
  const step = steps[current];
  const neutralPlaceholder = labels?.placeholder ?? "Type something else...";
  const escapePlaceholder = labels?.escapePlaceholder ?? neutralPlaceholder;
  const backLabel = labels?.back ?? "Back";
  const forwardLabel = labels?.forward ?? "Forward";
  const skipLabel = labels?.skip ?? "Skip";
  const recommendedLabel = labels?.recommended ?? "Recommended";
  const progress = labels?.progress ?? defaultProgress;

  const apply = useCallback(
    (t: Transition) => {
      setState(t.state);
      if (t.completed) onComplete(t.completed);
    },
    [onComplete],
  );

  const stepId = step?.id ?? "";
  const draft = draftFor(state, stepId);
  const selectedId =
    step?.kind === "question" ? selectedOptionId(state, stepId) : null;

  const onOption = useCallback(
    (optionId: string) => {
      if (disabled) return;
      apply(answerWithOption(state, steps, optionId));
    },
    [apply, disabled, state, steps],
  );

  // Number-key shortcuts (1, 2, 3...) select the matching option row, mirroring
  // the visible badge numbers. Ignored while focus is in a text field, so typing
  // digits into the free-text answer or the real composer is unaffected.
  useEffect(() => {
    if (disabled || !step || step.kind !== "question") return;
    const options = step.options ?? [];
    if (options.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (isEditable) return;
      const option = options[Number(e.key) - 1];
      if (!option) return;
      e.preventDefault();
      onOption(option.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, step, onOption]);

  const onSend = useCallback(() => {
    if (disabled) return;
    apply(answerWithText(state, steps));
  }, [apply, disabled, state, steps]);

  const onSkip = useCallback(() => {
    if (disabled) return;
    apply(skipStep(state, steps));
  }, [apply, disabled, state, steps]);

  const onConnected = useCallback(() => {
    apply(advanceConnect(state, steps));
  }, [apply, state, steps]);

  const onSignedIn = useCallback(() => {
    apply(advanceSignin(state, steps));
  }, [apply, state, steps]);

  if (!step) return null;

  const isQuestion = step.kind === "question";
  const optionsPresent = isQuestion && hasSelectableOptions(step.options);

  // Only a question routes its title through the header; a signin/connect body
  // renders its OWN icon+title lockup, so the header keeps just the pager + X.
  const title = step.kind === "question" ? step.question : undefined;

  // The pager chevrons ARE the step navigation for every kind: back walks to the
  // previous already-reached step, forward re-advances toward the frontier past
  // an already-reached step (the only way onward from a revisited completed
  // signin/connect step, whose card can't re-fire its own completion).
  const onBack = !disabled && current > 0 ? () => setState(goBack) : null;
  const onForward =
    !disabled && canGoForward(state) ? () => setState(goForward) : null;

  const footerApi: StepFooterApi = {
    revisited: canGoForward(state),
    onSkip,
  };

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "overflow-clip rounded-2xl border border-border bg-background p-5",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)]",
        "focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_12px_rgba(0,0,0,0.07)]",
        "dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
        "transition-shadow",
        disabled && "opacity-50",
      )}
    >
      <StepperHeader
        backLabel={backLabel}
        disabled={disabled}
        dismissLabel={labels?.dismiss ?? "Dismiss"}
        forwardLabel={forwardLabel}
        onBack={onBack}
        onDismiss={onDismiss}
        onForward={onForward}
        progressLabel={progress(current + 1, total)}
        title={title}
        total={total}
      />

      {/* Content changes, chrome doesn't: a single quiet fade on step swap. */}
      <div
        className="motion-safe:animate-[interaction-step-in_200ms_cubic-bezier(0.25,0.1,0.25,1)]"
        key={step.id}
      >
        {isQuestion ? (
          // The option rows and the free-text escape row form ONE tight list:
          // the escape row reads as the last row, not a separate control.
          <div className="mt-3 flex flex-col gap-0.5">
            {optionsPresent && (
              <div className="flex flex-col gap-0.5" role="radiogroup">
                {step.options?.map((option, index) => (
                  <OptionRow
                    disabled={disabled}
                    key={option.id}
                    onSelect={() => onOption(option.id)}
                    option={option}
                    position={index + 1}
                    recommendedLabel={recommendedLabel}
                    selected={selectedId === option.id}
                  />
                ))}
              </div>
            )}

            <FreeTextRow
              disabled={disabled}
              onChange={(value) => setState((s) => setDraft(s, stepId, value))}
              onSkip={onSkip}
              onSubmit={onSend}
              placeholder={
                optionsPresent ? escapePlaceholder : neutralPlaceholder
              }
              skipLabel={skipLabel}
              value={draft}
            />
          </div>
        ) : step.kind === "signin" ? (
          renderSignin(step, { ...footerApi, onSignedIn })
        ) : (
          renderConnect(step, { ...footerApi, onConnected })
        )}
      </div>
    </div>
  );
}
