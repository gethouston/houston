"use client";

import { cn } from "@houston-ai/core";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { ChatInteractionOption } from "./interaction-card-logic";

/** The app-logo lockup image for a branded question's title, sized to match the
 *  header's icon row (24px, the same box the connect card's `sm` logo uses). The
 *  URL is app-supplied; a load failure drops the image so the title falls back to
 *  the name alone — never a broken image. `alt` is the app name so the logo is
 *  addressable in tests/a11y. */
export function BrandLogo({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      alt={name}
      className="size-6 shrink-0 rounded-lg object-contain"
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      src={url}
    />
  );
}

/** A question step's scrollable body: the single-select option rows (when the
 *  agent offered choices). The free-text escape field and the card-wide decline
 *  are NOT here — they live in {@link QuestionAnswerRow}, fixed below the
 *  scroll region. Selecting an option answers and advances. */
export function QuestionStepBody({
  options,
  selectedId,
  disabled,
  recommendedLabel,
  onOption,
}: {
  options?: ChatInteractionOption[];
  selectedId: string | null;
  disabled: boolean;
  recommendedLabel: string;
  onOption: (optionId: string) => void;
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
 *  fill, not a border. A label longer than the row WRAPS onto more lines —
 *  never an ellipsis: the user is choosing between these sentences, so every
 *  word must be readable at any panel width (PRODUCT-1769). An option's
 *  `description`, when present, sits under the label as a muted second line
 *  that wraps the same way. */
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
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-ink text-sm leading-snug">
            {option.label}
          </span>
          {option.recommended && (
            <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 font-medium text-[11px] text-ink-muted">
              {recommendedLabel}
            </span>
          )}
        </span>
        {option.description ? (
          <span className="min-w-0 break-words text-ink-muted text-xs leading-snug">
            {option.description}
          </span>
        ) : null}
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
