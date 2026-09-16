import { cn } from "@houston-ai/core";
import type { KeyboardEventHandler } from "react";
import type { ChoiceOption } from "./choice-step-model";
import { CHIP_ATTR } from "./use-choice-keyboard";

/** Every choice shares height, radius and press feedback. The outlined door out
 *  of the catalog (`choice-row.tsx`) wears it too, so the two read as
 *  one family of controls and stand the same height as the filter field. */
export const CHIP_BASE =
  "flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-[background-color,color,transform] duration-200 active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-focus/50 md:min-h-0 md:py-2";

/**
 * A wrapping run of pill choices — the create flow's way of asking a question
 * with many right answers. Every option is visible and one tap away (never a
 * dropdown, never hover-revealed): the list itself teaches the kind of answer
 * that belongs there.
 *
 * The run holds catalog answers ALONE. "Something else" is not one of them —
 * it is the way to give an answer nobody listed, and it sits beside the filter
 * field above (`choice-row.tsx`) where it is read once instead of
 * scanned past on every query.
 *
 * The chips are radios of the ONE radio group the whole question wears
 * (`choice-runs.tsx`), so a run is only the wrap it is drawn in and carries no
 * grouping of its own. Exactly ONE chip of the question is in the tab order
 * (`rovingId`), which is what keeps a keyboard out of a 180-stop tab tunnel;
 * the arrows walk the rest, across every run at once (`use-choice-keyboard.ts`).
 */
export function ChoiceChips({
  options,
  selectedId,
  rovingId,
  onSelect,
  onKeyDown,
  onChipFocus,
}: {
  options: readonly ChoiceOption[];
  selectedId: string | null;
  /** The one chip of the whole question that holds the tab stop. */
  rovingId: string | null;
  onSelect: (id: string) => void;
  /** Arrow-key movement across every run of the question at once. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  /** Where the focus is now, so the tab stop can follow it there. */
  onChipFocus?: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const picked = option.id === selectedId;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a pill carrying its own label in a wrapping run needs a native <button>; radio semantics come from role + aria-checked + the roving tabindex the arrow grid walks.
          <button
            key={option.id}
            type="button"
            role="radio"
            {...{ [CHIP_ATTR]: "" }}
            tabIndex={option.id === rovingId ? 0 : -1}
            aria-checked={picked}
            onClick={() => onSelect(option.id)}
            onKeyDown={onKeyDown}
            onFocus={() => onChipFocus?.(option.id)}
            className={cn(
              CHIP_BASE,
              picked
                ? "bg-action text-action-text"
                : "bg-chip text-chip-text hover:bg-hover hover:text-hover-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
