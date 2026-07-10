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
  skipQuestion,
  type Transition,
} from "./interaction-card-logic";
import { OptionRow, StepperHeader } from "./interaction-card-parts";

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
  /** Renders a connect step's body; call `api.onConnected` to advance. ui/chat
   *  stays Composio-unaware, so the app supplies the connect card. */
  renderConnect: (
    step: ConnectStep,
    api: { onConnected: () => void },
  ) => ReactNode;
  /** Renders a signin step's body; call `api.onSignedIn` to advance. ui/chat
   *  stays auth-unaware, so the app supplies the sign-in card. */
  renderSignin: (
    step: SigninStep,
    api: { onSignedIn: () => void },
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
    forward?: string;
    skip?: string;
    dismiss?: string;
    progress?: (current: number, total: number) => string;
  };
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
  const forwardLabel = labels?.forward ?? "Next";
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
    apply(skipQuestion(state, steps));
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
          questionText={isQuestion ? step.question : undefined}
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
            renderSignin(step, { onSignedIn })
          ) : (
            renderConnect(step, { onConnected })
          )}
        </div>

        {/* ALL step-to-step navigation lives here, one row, Back leftmost: a
            single place to look for "how do I move." Back walks to the previous
            already-reached step (any kind); Skip/Next are question-only (Next
            commits, or on a revisited step re-commits the pre-filled answer,
            which doubles as its own "forward"); a bare Forward only shows for a
            revisited non-question step, since a connect/signin step's own card
            can't re-fire its completion callback once already done. */}
        {(current > 0 ||
          isQuestion ||
          (!isQuestion && canGoForward(state))) && (
          <div className="mt-4 flex items-center justify-end gap-1.5">
            {current > 0 && (
              <Button
                disabled={disabled}
                onClick={() => setState(goBack)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {backLabel}
              </Button>
            )}
            {isQuestion ? (
              <>
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
              </>
            ) : (
              canGoForward(state) && (
                <Button
                  disabled={disabled}
                  onClick={() => setState(goForward)}
                  size="sm"
                  type="button"
                >
                  {forwardLabel}
                </Button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
