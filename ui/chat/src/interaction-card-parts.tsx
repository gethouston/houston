"use client";

import { Button, cn } from "@houston-ai/core";
import { XIcon } from "lucide-react";
import type { ChatInteractionOption } from "./interaction-card-logic";

/** One selectable answer, a full-width single-select row (click = answer),
 *  styled as a Mercury row: a raised white surface with a hairline border and
 *  roomy padding. The label sits left (in a column so a subtitle can slot in
 *  later); when `keycap` is set, its 1-based `position` shows on the right as a
 *  subtle bordered keycap — a keyboard-shortcut hint, deliberately NOT a
 *  left-side list marker. Selection is carried by the accent border + tint.
 *  A single-option step passes `keycap={false}` so a lone row never shows an
 *  arbitrary "1". */
export function OptionRow({
  option,
  selected,
  disabled,
  position,
  keycap,
  onSelect,
}: {
  option: ChatInteractionOption;
  selected: boolean;
  disabled: boolean;
  position: number;
  keycap: boolean;
  onSelect: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a full-width single-select row needs a native <button> (focus + Enter/Space activation) with role="radio" for the radiogroup semantics; <input type="radio"> can't carry this layout/content.
    <button
      aria-checked={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-3.5 py-3 text-left text-sm text-foreground outline-none transition-colors",
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
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{option.label}</span>
      </span>
      {keycap && (
        <kbd className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted px-1 font-medium font-sans text-[11px] text-muted-foreground tabular-nums">
          {position}
        </kbd>
      )}
    </button>
  );
}

export interface StepperHeaderProps {
  /** Total step count; the progress eyebrow shows only for a multi-step sequence. */
  total: number;
  /** The quiet progress micro-label, e.g. "Step 1 of 3" (shown when total > 1). */
  progressLabel: string;
  /** The current step's question text, rendered as the card's title; omitted for
   *  signin/connect steps (those supply their own heading in the body). */
  questionText?: string;
  /** Dismisses the WHOLE interaction sequence. The X button renders only when
   *  supplied, so a caller with no dismiss affordance simply omits it. */
  onDismiss?: () => void;
  dismissLabel: string;
  disabled: boolean;
}

/** Card header, in the Mercury title idiom: a quiet progress micro-label
 *  eyebrow (only for a multi-step sequence) above the step's question rendered
 *  as a real title in the body, with an unobtrusive dismiss X pinned top-right.
 *  Purely informational + the one escape hatch — all step-to-step navigation
 *  (back/skip/next) lives together in the footer, see `ChatInteractionCard`. */
export function StepperHeader({
  total,
  progressLabel,
  questionText,
  onDismiss,
  dismissLabel,
  disabled,
}: StepperHeaderProps) {
  return (
    // No horizontal padding: the eyebrow, title, option rows and footer all
    // hang from the same left line (the content column's edge), Mercury-style.
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {total > 1 && (
          <p className="font-medium text-muted-foreground text-xs">
            {progressLabel}
          </p>
        )}
        {questionText && (
          <p
            className={cn(
              "text-balance text-base text-foreground leading-snug",
              total > 1 && "mt-1.5",
            )}
          >
            {questionText}
          </p>
        )}
      </div>

      {onDismiss && (
        <Button
          aria-label={dismissLabel}
          className="-mr-1 -mt-1 shrink-0"
          disabled={disabled}
          onClick={onDismiss}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
