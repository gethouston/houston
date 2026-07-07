"use client";

import { cn } from "@houston-ai/core";
import { type KeyboardEvent, useCallback, useState } from "react";
import { PromptInputSubmit } from "./ai-elements/prompt-input";
import {
  type ChatQuestion,
  canSend,
  composeReply,
  isFastPath,
  type QuestionSelections,
} from "./question-card-logic";
import { QuestionBlock } from "./question-card-parts";

export type {
  ChatQuestion,
  ChatQuestionOption,
} from "./question-card-logic";

export interface ChatQuestionCardProps {
  /** 1..3 questions, rendered in order. */
  questions: ChatQuestion[];
  /** Receives the fully composed reply (see composeReply). */
  onAnswer: (text: string) => void;
  disabled?: boolean;
  labels?: { placeholder?: string; send?: string };
}

/**
 * The in-chat surface shown when the agent pauses to ask the user something.
 * It REPLACES the composer, so it is built from the composer's own vocabulary
 * (rounded-[28px] bg-card surface, borderless inline textarea, round submit)
 * and reads as one family with ChatInput. Questions stack vertically; each
 * offers single-select option rows; a free-text field is ALWAYS visible at the
 * bottom as the "answer in your own words" channel.
 */
export function ChatQuestionCard({
  questions,
  onAnswer,
  disabled = false,
  labels,
}: ChatQuestionCardProps) {
  const [selections, setSelections] = useState<QuestionSelections>({});
  const [freeText, setFreeText] = useState("");

  const placeholder = labels?.placeholder ?? "Type your answer...";
  const sendLabel = labels?.send ?? "Send";
  const batched = questions.length > 1;

  const send = useCallback(
    (state: QuestionSelections, text: string) => {
      if (disabled) return;
      const reply = composeReply(questions, state, text);
      if (reply === null) return;
      onAnswer(reply);
    },
    [disabled, questions, onAnswer],
  );

  const handleSelect = useCallback(
    (questionId: string, optionId: string) => {
      if (disabled) return;
      // Fast path: one question with options + empty input → send on click.
      if (isFastPath(questions, freeText)) {
        send({ [questionId]: optionId }, freeText);
        return;
      }
      setSelections((prev) => ({
        ...prev,
        [questionId]: prev[questionId] === optionId ? null : optionId,
      }));
    },
    [disabled, questions, freeText, send],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(selections, freeText);
      }
    },
    [send, selections, freeText],
  );

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "overflow-clip rounded-[28px] border border-border/50 bg-card p-2.5",
        "shadow-[0_1px_6px_rgba(0,0,0,0.06)] focus-within:shadow-[0_1px_10px_rgba(0,0,0,0.1)]",
        "dark:shadow-[0_1px_6px_rgba(0,0,0,0.2)] dark:focus-within:shadow-[0_1px_10px_rgba(0,0,0,0.3)]",
        disabled && "opacity-50",
      )}
    >
      <div className="flex flex-col px-2.5 pt-2 pb-2">
        {questions.map((question, i) => (
          <div className={cn(i > 0 && "mt-8")} key={question.id}>
            <QuestionBlock
              batched={batched}
              disabled={disabled}
              onSelect={(optionId) => handleSelect(question.id, optionId)}
              question={question}
              selectedId={selections[question.id] ?? null}
            />
          </div>
        ))}

        <div className="mt-4 flex items-end gap-2 rounded-2xl border border-border/50 bg-background px-3 py-2 transition-colors focus-within:border-border">
          <textarea
            className="max-h-40 flex-1 resize-none border-none bg-transparent py-1 text-base text-foreground leading-[1.2] outline-none placeholder:text-muted-foreground/50"
            disabled={disabled}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            value={freeText}
          />
          <PromptInputSubmit
            aria-label={sendLabel}
            className="shrink-0"
            disabled={disabled || !canSend(questions, selections, freeText)}
            onClick={() => send(selections, freeText)}
          />
        </div>
      </div>
    </div>
  );
}
