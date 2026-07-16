"use client";

import { Button, cn, Kbd } from "@houston-ai/core";
import { ArrowRight, ArrowUp } from "lucide-react";
import { useRef } from "react";
import type { ChatInteractionOption } from "./interaction-card-logic";

/** A question step's body: the single-select option rows (when the agent offered
 *  choices) followed by the free-text ESCAPE field, as ONE tight list so the
 *  field reads as the last row, not a separate control. The card-wide decline is
 *  NOT here — it lives in the modal footer. Selecting an option answers and
 *  advances; typing + Enter submits the field. */
export function QuestionStepBody({
  options,
  selectedId,
  disabled,
  recommendedLabel,
  draft,
  placeholder,
  sendLabel,
  hideFreeText = false,
  skip,
  onOption,
  onDraftChange,
  onSubmit,
}: {
  options?: ChatInteractionOption[];
  selectedId: string | null;
  disabled: boolean;
  recommendedLabel: string;
  draft: string;
  placeholder: string;
  sendLabel: string;
  /** Drop the free-text escape row: the option rows are the only way to answer
   *  (the skip button keeps its place, right-aligned on its own row). */
  hideFreeText?: boolean;
  /** The card-wide decline, rendered OUTSIDE the field at its right so the
   *  input row reads as "type here, or skip" in one glance. */
  skip: {
    label: string;
    escLabel: string;
    onSkip: () => void;
    disabled: boolean;
  };
  onOption: (optionId: string) => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {options && options.length > 0 && (
        <div className="flex flex-col gap-0.5" role="radiogroup">
          {options.map((option, index) => (
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

      <div
        className={cn("flex items-center gap-2", hideFreeText && "justify-end")}
      >
        {!hideFreeText && (
          <div className="min-w-0 flex-1">
            <FreeTextRow
              disabled={disabled}
              onChange={onDraftChange}
              onSubmit={onSubmit}
              placeholder={placeholder}
              sendLabel={sendLabel}
              value={draft}
            />
          </div>
        )}
        <Button
          className="mt-1.5 gap-1.5 text-ink-muted"
          disabled={skip.disabled}
          onClick={skip.onSkip}
          size="sm"
          type="button"
          variant="outline"
        >
          {skip.label}
          <Kbd>{skip.escLabel}</Kbd>
        </Button>
      </div>
    </div>
  );
}

/** One selectable answer, a full-width single-select row (click = answer): a
 *  REGULAR-weight label (never bold — color tone carries the hierarchy), an
 *  optional soft "Recommended" chip, and a RIGHT-edge circular number badge
 *  (the digit doubles as the keyboard shortcut). The row surface is transparent
 *  until hover/selected, when it fills a soft grey and the badge crossfades
 *  into a trailing arrow — the affordance that a click answers and advances —
 *  in the same right slot, so nothing shifts. Selection is carried by that same
 *  fill, not a border. The option's wire `description` is intentionally NOT
 *  rendered: the label + chip say enough. */
export function OptionRow({
  option,
  selected,
  disabled,
  position,
  recommendedLabel,
  onSelect,
}: {
  option: ChatInteractionOption;
  selected: boolean;
  disabled: boolean;
  position: number;
  recommendedLabel: string;
  onSelect: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a full-width single-select row needs a native <button> (focus + Enter/Space activation) with role="radio" for the radiogroup semantics; <input type="radio"> can't carry this layout/content.
    <button
      aria-checked={selected}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors",
        "hover:bg-hover focus-visible:bg-hover",
        "focus-visible:ring-[2px] focus-visible:ring-focus/50",
        "disabled:pointer-events-none disabled:opacity-50",
        selected && "bg-hover",
      )}
      disabled={disabled}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate text-ink text-sm">
          {option.label}
        </span>
        {option.recommended && (
          <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 font-medium text-[11px] text-ink-muted">
            {recommendedLabel}
          </span>
        )}
      </span>
      {/* One right slot: the number badge at rest, the advance arrow on
          hover/selected — a crossfade in place, so the row never reflows. */}
      <span className="relative flex size-7 shrink-0 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-chip-subtle font-medium text-[13px] text-ink-muted tabular-nums transition-opacity",
            "group-hover:opacity-0",
            selected && "opacity-0",
          )}
        >
          {position}
        </span>
        <ArrowRight
          className={cn(
            "size-4 text-ink-muted opacity-0 transition-opacity",
            "group-hover:opacity-100",
            selected && "opacity-100",
          )}
        />
      </span>
    </button>
  );
}

/** The free-text escape row: the answer field the user types their OWN answer
 *  into. It is a MINIATURE of the real composer so nothing about it needs
 *  learning: the same 28px pill roundness, the same `border-line-input` hairline,
 *  and the same circular arrow-up send button that turns on (bg-action at
 *  full strength) the moment there is text — dimmed while empty, exactly like
 *  the chat input's send. Clicking anywhere in the field focuses the textarea;
 *  typing expands it; Enter or the arrow submits. The card-wide decline is NOT
 *  here — it lives in the modal footer, so this row is purely the input it
 *  looks like. On a free-text-only question (no options) it is the primary
 *  answer field, so it takes a neutral placeholder. */
export function FreeTextRow({
  value,
  placeholder,
  sendLabel,
  disabled,
  onChange,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  sendLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = value.trim().length > 0;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: focus-delegation surface — the real widget is the <textarea> inside; clicking the field's padding focuses it (mirrors the composer). role="presentation" is correct, no widget role applies.
    <div
      className={cn(
        "mt-1.5 flex cursor-text items-center gap-2 rounded-[28px] border border-line-input bg-transparent py-1.5 pr-1.5 pl-4 transition-colors dark:bg-line-input/30",
        "focus-within:border-focus",
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={() => textareaRef.current?.focus()}
      role="presentation"
    >
      <textarea
        className="max-h-40 min-w-0 flex-1 resize-none border-none bg-transparent py-1 text-ink text-sm leading-snug outline-none placeholder:text-ink-muted"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      {/* The composer's send button, verbatim: circular arrow-up that turns on
          with text (disabled:opacity-30 while empty, like the chat input). */}
      <button
        aria-label={sendLabel}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-action text-action-text transition-colors hover:bg-action/90 disabled:opacity-30"
        disabled={disabled || !hasText}
        onClick={(e) => {
          e.stopPropagation();
          onSubmit();
        }}
        type="button"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}
