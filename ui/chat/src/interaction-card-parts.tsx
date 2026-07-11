"use client";

import { Button, cn } from "@houston-ai/core";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ChatInteractionOption } from "./interaction-card-logic";

/** One selectable answer, a full-width single-select row (click = answer). In
 *  the reference language: a LEFT circular number badge (the digit doubles as
 *  the keyboard shortcut), a bold label, an optional soft "Recommended" chip,
 *  and the option's description muted INLINE after the label (single line,
 *  truncated). The row surface is transparent until hover/selected, when it
 *  fills a soft grey and reveals a trailing arrow — the affordance that a click
 *  answers and advances. Selection is carried by that same fill, not a border. */
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
        "hover:bg-accent focus-visible:bg-accent",
        "focus-visible:ring-[2px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        selected && "bg-accent",
      )}
      disabled={disabled}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-[13px] text-muted-foreground tabular-nums transition-colors",
          "group-hover:bg-muted-foreground/15",
          selected && "bg-muted-foreground/15",
        )}
      >
        {position}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 font-semibold text-foreground text-sm">
          {option.label}
        </span>
        {option.recommended && (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-medium text-[11px] text-muted-foreground">
            {recommendedLabel}
          </span>
        )}
        {option.description && (
          <span className="min-w-0 truncate text-muted-foreground text-sm">
            {option.description}
          </span>
        )}
      </span>
      <ArrowRight
        className={cn(
          "size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity",
          "group-hover:opacity-100",
          selected && "opacity-100",
        )}
      />
    </button>
  );
}

/** The free-text escape row: styled as the LAST row of the option list. A pencil
 *  icon fills the same circular left-badge slot, the input carries a muted
 *  placeholder ("None of these..."), and a `Skip` outline pill sits INLINE at
 *  the row's right. Typing expands the input; Enter submits the answer, the pill
 *  skips the question. On a free-text-only question (no options) it is the
 *  primary answer field, so it takes a neutral placeholder. */
export function FreeTextRow({
  value,
  placeholder,
  skipLabel,
  disabled,
  onChange,
  onSubmit,
  onSkip,
}: {
  value: string;
  placeholder: string;
  skipLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors focus-within:bg-accent/60">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Pencil className="size-3.5" />
      </span>
      <textarea
        className="max-h-40 min-w-0 flex-1 resize-none border-none bg-transparent py-0.5 text-foreground text-sm leading-snug outline-none placeholder:text-muted-foreground"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        value={value}
      />
      <Button
        className="shrink-0 rounded-full"
        disabled={disabled}
        onClick={onSkip}
        size="sm"
        type="button"
        variant="outline"
      >
        {skipLabel}
      </Button>
    </div>
  );
}

/** The compact pager pinned top-right: `‹ N of M ›`. The chevrons ARE the
 *  step navigation (Back / Forward), replacing a footer nav row; each is
 *  disabled at its end of the sequence. Rendered only for a multi-step sequence
 *  (a lone step shows no pager). */
function Pager({
  label,
  backLabel,
  forwardLabel,
  onBack,
  onForward,
  disabled,
}: {
  label: string;
  backLabel: string;
  forwardLabel: string;
  onBack: (() => void) | null;
  onForward: (() => void) | null;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <Button
        aria-label={backLabel}
        className="size-6"
        disabled={disabled || !onBack}
        onClick={onBack ?? undefined}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="px-0.5 text-xs tabular-nums">{label}</span>
      <Button
        aria-label={forwardLabel}
        className="size-6"
        disabled={disabled || !onForward}
        onClick={onForward ?? undefined}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export interface StepperHeaderProps {
  /** Total step count; the pager shows only for a multi-step sequence. */
  total: number;
  /** The pager's compact progress copy, e.g. "1 of 3". */
  progressLabel: string;
  /** The current step's title, rendered bold and left. Question steps pass their
   *  question here; signin/connect steps render their OWN icon+title lockup in
   *  the body and leave this undefined, so the header keeps only the right-hand
   *  pager + dismiss cluster. */
  title?: string;
  /** Step navigation, wired straight to the stepper: the pager's back chevron
   *  (null on the first step) and forward chevron (null at the frontier). */
  onBack: (() => void) | null;
  onForward: (() => void) | null;
  backLabel: string;
  forwardLabel: string;
  /** Dismisses the WHOLE interaction sequence. The X renders only when supplied. */
  onDismiss?: () => void;
  dismissLabel: string;
  disabled: boolean;
}

/** Card header in the reference language: a bold left title with, top-RIGHT on
 *  the same row, the compact `‹ N of M ›` pager (Back/Forward chevrons) and the
 *  dismiss X. No eyebrow. A signin/connect step leaves `title` undefined (its
 *  icon+title lockup lives in the body) so only the pager + X remain. */
export function StepperHeader({
  total,
  progressLabel,
  title,
  onBack,
  onForward,
  backLabel,
  forwardLabel,
  onDismiss,
  dismissLabel,
  disabled,
}: StepperHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        {title && (
          <p className="text-balance font-semibold text-base text-foreground leading-snug">
            {title}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {total > 1 && (
          <Pager
            backLabel={backLabel}
            disabled={disabled}
            forwardLabel={forwardLabel}
            label={progressLabel}
            onBack={onBack}
            onForward={onForward}
          />
        )}
        {onDismiss && (
          <Button
            aria-label={dismissLabel}
            className="-mr-1 shrink-0 text-muted-foreground"
            disabled={disabled}
            onClick={onDismiss}
            size="icon-sm"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** The one right-aligned footer row a signin/connect body composes: quiet
 *  "Not now" + Esc hint on the way to the single filled CTA pill. Exported so
 *  the app composes the EXACT same footer chrome — one place owns spacing and
 *  alignment. Question steps have NO footer (their actions live in the rows). */
export function InteractionFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 flex items-center justify-end gap-3">{children}</div>
  );
}
