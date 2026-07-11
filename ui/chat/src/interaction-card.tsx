"use client";

import { Button, cn } from "@houston-ai/core";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  advanceConnect,
  advanceSignin,
  answerWithOption,
  answerWithText,
  type ChatInteractionAnswer,
  type ChatInteractionStep,
  canAdvanceQuestion,
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
import { prettifyToolkit } from "./interaction-card-model.ts";
import {
  InteractionFooter,
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
  /** Renders a connect step's body AND footer; call `api.onConnected` to advance.
   *  ui/chat stays Composio-unaware, so the app supplies the reactive connect
   *  content. It owns the centered identity hero + primary CTA (a filled pill in
   *  {@link InteractionFooter}); the card supplies the shared step-nav via `api`
   *  (the `back` node plus the `onForward`/`onSkip` callbacks) so the app never
   *  re-implements navigation, and routes the step's title through the shared
   *  header. See {@link StepFooterApi}. */
  renderConnect: (
    step: ConnectStep,
    api: StepFooterApi & { onConnected: () => void },
  ) => ReactNode;
  /** Renders a signin step's body AND footer; call `api.onSignedIn` to advance.
   *  ui/chat stays auth-unaware, so the app supplies the reactive sign-in
   *  content (centered hero + filled CTA), placing the card's `api.back` node
   *  and `api.onForward` callback in the shared footer. See {@link
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
    placeholder?: string;
    /** Visible label + aria-label of the commit-and-advance button ("Next"). */
    send?: string;
    back?: string;
    skip?: string;
    dismiss?: string;
    progress?: (current: number, total: number) => string;
    /** Header title for a signin step with no agent-supplied reason. */
    signinTitle?: string;
    /** Header title for a connect step with no agent-supplied reason, given a
     *  readable app name derived from the toolkit slug. */
    connectTitle?: (app: string) => string;
  };
}

/** The shared step-navigation the card hands a signin/connect body so it can
 *  compose the ONE footer row without owning navigation state. `back` is a
 *  ready-styled node (or null on step one); place it leftmost. `onForward` and
 *  `onSkip` are transition callbacks the body wires to its OWN buttons (so it
 *  can pick each button's treatment from the connection/auth state only it
 *  knows — the card is Composio/auth-unaware):
 *  - `onSkip` (live frontier only, `onForward` null): advance past the step
 *    WITHOUT completing it, recording the skip so the composed reply tells the
 *    agent the user declined. Rendered as a ghost Skip beside the filled CTA.
 *  - `onForward` (non-null only for a REVISITED, already-reached step): advance
 *    toward the frontier without re-committing. A revisited COMPLETED step
 *    (its card can't re-fire its own completion) renders it as the filled
 *    primary — the only way onward; a revisited SKIPPED step (still actionable)
 *    renders it as a ghost "keep it skipped" beside a fresh filled CTA, so the
 *    user can reconsider and complete it after all. */
export interface StepFooterApi {
  back: ReactNode | null;
  onForward: (() => void) | null;
  onSkip: () => void;
}

/**
 * The in-chat surface shown when the agent pauses to gather what it needs before
 * continuing: a stepper that walks the user through ONE step at a time (question
 * or connect). The header follows the Mercury title idiom: a quiet "Step N of M"
 * micro-label (only for a multi-step sequence) above the question rendered as a
 * real title, with an unobtrusive dismiss X top-right. ALL step-to-step
 * navigation (back / skip / next) lives together in one footer row as quiet
 * ghost buttons plus a single filled Next pill, Back leftmost, so there's a
 * single place to look for "how do I move." A question step's option rows are
 * also keyboard-selectable by their position number (shown as a right-aligned
 * keycap hint when there's more than one option) whenever focus isn't in a text
 * field. It renders ABOVE the real composer (which the caller keeps mounted
 * alongside it, see `chat-panel.tsx`), so it borrows the composer's vocabulary
 * (rounded-[28px] surface, borderless inline textarea) without replacing it —
 * typing directly into the real composer instead is the caller's job to treat
 * as an implicit abandon of this card. The surface is grey (`bg-secondary`) so
 * the white option rows and free-text input read as raised, distinct chips.
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
  const placeholder = labels?.placeholder ?? "Type something else...";
  const nextLabel = labels?.send ?? "Next";
  const backLabel = labels?.back ?? "Back";
  const skipLabel = labels?.skip ?? "Skip";
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
  // the visible position numbers. Ignored while focus is in a text field, so
  // typing digits into the free-text answer or the real composer is unaffected.
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

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend],
  );

  if (!step) return null;

  const isQuestion = step.kind === "question";
  const canSend = canAdvanceQuestion(selectedId !== null, draft);

  // Every step kind routes its title through the ONE header slot, so a connect
  // step's reason reads with the same weight/position as a question. Falls back
  // to a labelled title when the agent gave no reason.
  const title =
    step.kind === "question"
      ? step.question
      : step.kind === "signin"
        ? (step.reason ?? labels?.signinTitle)
        : (step.reason ??
          labels?.connectTitle?.(prettifyToolkit(step.toolkit)));

  // The shared step-nav handed to a signin/connect body so it composes the
  // footer without owning navigation state. `back` is a ready-styled node
  // (styled exactly like the question footer's Back); `onForward` is a bare
  // transition callback (non-null only for a revisited, already-reached step)
  // that the body wires to its OWN forward button so it can pick the treatment
  // — filled when the step is already completed (the only way onward), ghost
  // "keep it skipped" when it was skipped and is being reconsidered.
  const backNode =
    current > 0 ? (
      <Button
        disabled={disabled}
        onClick={() => setState(goBack)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {backLabel}
      </Button>
    ) : null;
  const onForward =
    !disabled && canGoForward(state) ? () => setState(goForward) : null;
  const footerApi: StepFooterApi = {
    back: backNode,
    onForward,
    onSkip,
  };

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "overflow-clip rounded-[28px] border border-border/50 bg-secondary p-2.5",
        "shadow-[0_1px_6px_rgba(0,0,0,0.06)] focus-within:shadow-[0_1px_10px_rgba(0,0,0,0.1)]",
        "dark:shadow-[0_1px_6px_rgba(0,0,0,0.2)] dark:focus-within:shadow-[0_1px_10px_rgba(0,0,0,0.3)]",
        disabled && "opacity-50",
      )}
    >
      <div className="flex flex-col px-2.5 pt-2 pb-2">
        <StepperHeader
          disabled={disabled}
          dismissLabel={labels?.dismiss ?? "Dismiss"}
          onDismiss={onDismiss}
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
            // Options and the free-text row live in one evenly-spaced group, so
            // "Type something else..." reads as the last row of the same list —
            // the escape hatch, not a separate control.
            <div className="mt-4 flex flex-col gap-2">
              {hasSelectableOptions(step.options) && (
                <div className="flex flex-col gap-2" role="radiogroup">
                  {step.options?.map((option, index) => (
                    <OptionRow
                      disabled={disabled}
                      keycap={(step.options?.length ?? 0) > 1}
                      key={option.id}
                      onSelect={() => onOption(option.id)}
                      option={option}
                      position={index + 1}
                      selected={selectedId === option.id}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-background px-3.5 py-2.5 transition-colors focus-within:border-border">
                <textarea
                  className="max-h-40 flex-1 resize-none border-none bg-transparent py-0.5 text-base text-foreground leading-[1.3] outline-none placeholder:text-muted-foreground/50"
                  disabled={disabled}
                  onChange={(e) =>
                    setState((s) => setDraft(s, stepId, e.target.value))
                  }
                  onKeyDown={onKeyDown}
                  placeholder={placeholder}
                  rows={1}
                  value={draft}
                />
              </div>
            </div>
          ) : step.kind === "signin" ? (
            renderSignin(step, { ...footerApi, onSignedIn })
          ) : (
            renderConnect(step, { ...footerApi, onConnected })
          )}
        </div>

        {/* Question steps' navigation lives here, one row, Back leftmost: a
            single place to look for "how do I move." Back walks to the previous
            already-reached step; Skip advances past the question unanswered;
            Next is the single filled pill that commits. A signin/connect step
            renders its OWN footer inside its body (the app owns that reactive
            content), placing the same `InteractionFooter` with the card-supplied
            `back` node and its own buttons wired to the api's `onForward` /
            `onSkip` callbacks beside its filled CTA — so the chrome matches
            without the card knowing anything about Composio/auth. */}
        {isQuestion && (
          <InteractionFooter>
            {backNode}
            <Button
              disabled={disabled}
              onClick={onSkip}
              size="sm"
              type="button"
              variant="ghost"
            >
              {skipLabel}
            </Button>
            <Button
              disabled={disabled || !canSend}
              onClick={onSend}
              size="sm"
              type="button"
            >
              {nextLabel}
            </Button>
          </InteractionFooter>
        )}
      </div>
    </div>
  );
}
