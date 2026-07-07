"use client";

import { cn } from "@houston-ai/core";
import { CheckIcon } from "lucide-react";
import {
  type ChatQuestion,
  type ChatQuestionOption,
  hasSelectableOptions,
  QUESTION_TEXT_CLASS,
  QUESTION_TEXT_CLASS_BATCHED,
} from "./question-card-logic";

/** One selectable answer, a full-width single-select row (toggle on re-click). */
export function OptionRow({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: ChatQuestionOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a full-width single-select row needs a native <button> (focus + Enter/Space activation) with role="radio" for the radiogroup semantics; <input type="radio"> can't carry this layout/content.
    <button
      aria-checked={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background px-3.5 py-2.5 text-left text-sm text-foreground outline-none transition-colors",
        "hover:border-border hover:bg-accent",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        selected && "border-primary bg-primary/5 hover:border-primary",
      )}
      disabled={disabled}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span className="flex-1">{option.label}</span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {selected && <CheckIcon className="size-4 text-primary" />}
      </span>
    </button>
  );
}

/** A question head plus its vertical single-select option rows (if any). */
export function QuestionBlock({
  question,
  batched,
  selectedId,
  disabled,
  onSelect,
}: {
  question: ChatQuestion;
  batched: boolean;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div>
      <p
        className={batched ? QUESTION_TEXT_CLASS_BATCHED : QUESTION_TEXT_CLASS}
      >
        {question.question}
      </p>
      {hasSelectableOptions(question.options) && (
        <div className="mt-3 flex flex-col gap-2" role="radiogroup">
          {question.options?.map((option) => (
            <OptionRow
              disabled={disabled}
              key={option.id}
              onSelect={() => onSelect(option.id)}
              option={option}
              selected={selectedId === option.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
