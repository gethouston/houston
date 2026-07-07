"use client";

import { cn } from "@houston-ai/core";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { PromptInputSubmit } from "./ai-elements/prompt-input";
import {
  advanceConnect,
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
  QUESTION_TEXT_CLASS,
  selectedOptionId,
  setDraft,
  type Transition,
} from "./interaction-card-logic";
import { OptionRow, StepperHeader } from "./interaction-card-parts";

export type {
  ChatInteractionAnswer,
  ChatInteractionOption,
  ChatInteractionStep,
} from "./interaction-card-logic";

type ConnectStep = Extract<ChatInteractionStep, { kind: "connect" }>;

export interface ChatInteractionCardProps {
  /** The ordered interaction steps: question steps then connect steps (>=1). */
  steps: ChatInteractionStep[];
  /** Receives every question answer, in step order, once the last step is done. */
  onComplete: (answers: ChatInteractionAnswer[]) => void;
  /** Renders a connect step's body; call `api.onConnected` to advance. ui/chat
   *  stays Composio-unaware, so the app supplies the connect card. */
  renderConnect: (
    step: ConnectStep,
    api: { onConnected: () => void },
  ) => ReactNode;
  disabled?: boolean;
  labels?: {
    placeholder?: string;
    send?: string;
    back?: string;
    forward?: string;
    progress?: (current: number, total: number) => string;
  };
}

/**
 * The in-chat surface shown when the agent pauses to gather what it needs before
 * continuing: a stepper that walks the user through ONE step at a time (question
 * or connect), with a quiet "1 of X" progress and a back chevron. It REPLACES
 * the composer, so it borrows the composer's vocabulary (rounded-[28px] surface,
 * borderless inline textarea, round submit). The surface is grey (`bg-secondary`)
 * so the white option rows and free-text input read as raised, distinct chips.
 */
export function ChatInteractionCard({
  steps,
  onComplete,
  renderConnect,
  disabled = false,
  labels,
}: ChatInteractionCardProps) {
  const [state, setState] = useState(initialStepperState);

  const total = steps.length;
  const current = Math.min(state.current, total - 1);
  const step = steps[current];
  const placeholder = labels?.placeholder ?? "Type your answer...";
  const sendLabel = labels?.send ?? "Send";
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

  const onSend = useCallback(() => {
    if (disabled) return;
    apply(answerWithText(state, steps));
  }, [apply, disabled, state, steps]);

  const onConnected = useCallback(() => {
    apply(advanceConnect(state, steps));
  }, [apply, state, steps]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        {total > 1 && (
          <StepperHeader
            backLabel={labels?.back ?? "Back"}
            canGoBack={current > 0}
            canGoForward={canGoForward(state)}
            disabled={disabled}
            forwardLabel={labels?.forward ?? "Next"}
            onBack={() => setState(goBack)}
            onForward={() => setState(goForward)}
            progressText={progress(current + 1, total)}
          />
        )}

        {/* Content changes, chrome doesn't: a single quiet fade on step swap. */}
        <div
          className="motion-safe:animate-[interaction-step-in_200ms_cubic-bezier(0.25,0.1,0.25,1)]"
          key={step.id}
        >
          {isQuestion ? (
            <>
              <p className={QUESTION_TEXT_CLASS}>{step.question}</p>
              {hasSelectableOptions(step.options) && (
                <div className="mt-3 flex flex-col gap-2" role="radiogroup">
                  {step.options?.map((option) => (
                    <OptionRow
                      disabled={disabled}
                      key={option.id}
                      onSelect={() => onOption(option.id)}
                      option={option}
                      selected={selectedId === option.id}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            renderConnect(step, { onConnected })
          )}
        </div>

        {isQuestion && (
          <div className="mt-4 flex items-end gap-2 rounded-2xl border border-border/50 bg-background px-3 py-2 transition-colors focus-within:border-border">
            <textarea
              className="max-h-40 flex-1 resize-none border-none bg-transparent py-1 text-base text-foreground leading-[1.2] outline-none placeholder:text-muted-foreground/50"
              disabled={disabled}
              onChange={(e) =>
                setState((s) => setDraft(s, stepId, e.target.value))
              }
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              value={draft}
            />
            <PromptInputSubmit
              aria-label={sendLabel}
              className="shrink-0"
              disabled={disabled || !canSend}
              onClick={onSend}
            />
          </div>
        )}
      </div>
    </div>
  );
}
