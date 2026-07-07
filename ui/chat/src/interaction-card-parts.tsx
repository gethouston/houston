"use client";

import { Button, cn } from "@houston-ai/core";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ChatInteractionOption } from "./interaction-card-logic";

/** One selectable answer, a full-width single-select row (click = answer). */
export function OptionRow({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: ChatInteractionOption;
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

/** Quiet header: a back chevron (from step 2 on) and a right-aligned "1 of X".
 *  Once the user walks back onto an already-completed step, a forward chevron
 *  joins the progress on the right so they can return to the live frontier. That
 *  matters most for a revisited connect step, whose card can't re-fire
 *  onConnected once connected, leaving the forward chevron the only way onward.
 *  Renders only when there is more than one step, so a lone step shows no chrome
 *  and keeps the one-tap feel. `min-h-8` reserves the chevron's height so the
 *  progress text never shifts between step 1 and later steps. */
export function StepperHeader({
  progressText,
  canGoBack,
  onBack,
  backLabel,
  canGoForward,
  onForward,
  forwardLabel,
  disabled,
}: {
  progressText: string;
  canGoBack: boolean;
  onBack: () => void;
  backLabel: string;
  canGoForward: boolean;
  onForward: () => void;
  forwardLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="mb-1 flex min-h-8 items-center justify-between px-1">
      {canGoBack ? (
        <Button
          aria-label={backLabel}
          disabled={disabled}
          onClick={onBack}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
      ) : (
        <span className="size-8" />
      )}
      <div className="flex items-center gap-1">
        <span className="font-medium text-muted-foreground text-xs tabular-nums">
          {progressText}
        </span>
        {canGoForward && (
          <Button
            aria-label={forwardLabel}
            disabled={disabled}
            onClick={onForward}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
