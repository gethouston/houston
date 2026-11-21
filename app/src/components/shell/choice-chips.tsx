import { cn } from "@houston-ai/core";
import type { KeyboardEventHandler } from "react";
import type { ChoiceOption } from "./choice-step-model";
import { CHIP_ATTR } from "./use-choice-keyboard";

export const CHIP_BASE =
  "flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-[background-color,color,transform] duration-200 active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-focus/50 md:min-h-0 md:py-2";

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
  rovingId: string | null;
  onSelect: (id: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
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
