"use client";

import { Button, cn } from "@houston-ai/core";
import { XIcon } from "lucide-react";
import type { ChatInteractionOption } from "./interaction-card-logic";

/** One selectable answer, a full-width single-select row (click = answer). The
 *  bold label sits on the left; its 1-based `position` shows as quiet muted text
 *  on the right (always visible, replacing the old check-on-selected indicator —
 *  the number is the stable affordance, selection is carried by the border). */
export function OptionRow({
  option,
  selected,
  disabled,
  position,
  onSelect,
}: {
  option: ChatInteractionOption;
  selected: boolean;
  disabled: boolean;
  position: number;
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
      <span className="flex-1 font-medium">{option.label}</span>
      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
        {position}
      </span>
    </button>
  );
}

export interface StepperHeaderProps {
  /** 1-based index of the current step and the total step count (drives the pill). */
  current: number;
  total: number;
  /** Full accessible progress copy, e.g. "1 of 4" (aria-label on the pill). */
  progressLabel: string;
  /** The current step's question text; omitted for signin/connect steps. */
  questionText?: string;
  /** Dismisses the WHOLE interaction sequence. The X button renders only when
   *  supplied, so a caller with no dismiss affordance simply omits it. */
  onDismiss?: () => void;
  dismissLabel: string;
  disabled: boolean;
}

/** Card header: a "current/total" pill and the step's question text on the
 *  left, an optional dismiss X on the right. Purely informational + the one
 *  escape hatch — all step-to-step navigation (back/skip/next) lives together
 *  in the footer, see `ChatInteractionCard`. */
export function StepperHeader({
  current,
  total,
  progressLabel,
  questionText,
  onDismiss,
  dismissLabel,
  disabled,
}: StepperHeaderProps) {
  return (
    <div className="mb-1 flex min-h-8 items-center gap-1.5 px-1">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {total > 1 && (
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
            <span aria-hidden="true">
              {current}/{total}
            </span>
            <span className="sr-only">{progressLabel}</span>
          </span>
        )}
        {questionText && (
          <span className="min-w-0 truncate font-medium text-foreground text-sm">
            {questionText}
          </span>
        )}
      </div>

      {onDismiss && (
        <Button
          aria-label={dismissLabel}
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
