"use client";

import { Button, cn, Textarea } from "@houston-ai/core";
import { type KeyboardEvent, useCallback, useState } from "react";
import {
  type ChatQuestionOption,
  hasSelectableOptions,
  normalizeAnswer,
  OWN_ANSWER_TOGGLE_CLASS,
  QUESTION_TEXT_CLASS,
} from "./question-card-logic";

export type { ChatQuestionOption } from "./question-card-logic";

export interface ChatQuestionCardProps {
  question: string;
  options?: ChatQuestionOption[];
  /** Option click sends the option's label; free-text sends the typed text. */
  onAnswer: (text: string) => void;
  disabled?: boolean;
  labels?: { typeOwnAnswer?: string; placeholder?: string; send?: string };
}

/**
 * The in-chat surface shown when the agent pauses to ask the user something.
 * It REPLACES the composer, so it must read as "the one thing to do now":
 * a prominent question, always-visible option buttons, and a quiet toggle to
 * an inline free-text answer. With no options, the text input shows directly.
 */
export function ChatQuestionCard({
  question,
  options,
  onAnswer,
  disabled = false,
  labels,
}: ChatQuestionCardProps) {
  const hasOptions = hasSelectableOptions(options);
  // No options → free-text is the only way to answer, so show it immediately
  // rather than behind a toggle.
  const [showFreeText, setShowFreeText] = useState(!hasOptions);
  const [text, setText] = useState("");

  const typeOwnAnswerLabel =
    labels?.typeOwnAnswer ?? "Answer in your own words";
  const placeholder = labels?.placeholder ?? "Type your answer...";
  const sendLabel = labels?.send ?? "Send";

  const answer = useCallback(
    (value: string) => {
      if (disabled) return;
      const normalized = normalizeAnswer(value);
      if (normalized === null) return;
      onAnswer(normalized);
    },
    [disabled, onAnswer],
  );

  const submitFreeText = useCallback(() => {
    answer(text);
    setText("");
  }, [answer, text]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitFreeText();
      }
    },
    [submitFreeText],
  );

  // A pure card: the composer slot that hosts it owns the outer layout
  // (padding + max-width + centering), so this component adds none — it sits
  // consistently beside the connect interaction card in the same slot.
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "rounded-3xl border border-border/60 bg-card p-5 shadow-sm",
        disabled && "opacity-50",
      )}
    >
      <p className={QUESTION_TEXT_CLASS}>{question}</p>

      {hasOptions && (
        <div className="mt-4 flex flex-wrap gap-2">
          {options?.map((option) => (
            <Button
              className="rounded-full"
              disabled={disabled}
              key={option.id}
              onClick={() => answer(option.label)}
              type="button"
              variant="outline"
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {hasOptions && !showFreeText && (
        <button
          className={OWN_ANSWER_TOGGLE_CLASS}
          disabled={disabled}
          onClick={() => setShowFreeText(true)}
          type="button"
        >
          {typeOwnAnswerLabel}
        </button>
      )}

      {showFreeText && (
        <div className={cn("flex items-end gap-2", hasOptions && "mt-4")}>
          <Textarea
            className="min-h-11 flex-1 resize-none rounded-2xl"
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            value={text}
          />
          <Button
            className="rounded-full"
            disabled={disabled || normalizeAnswer(text) === null}
            onClick={submitFreeText}
            type="button"
          >
            {sendLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
