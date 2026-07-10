/**
 * SkillCategorySelect: the category picker that sits beside the marketplace
 * search box (the Integrations `AppCatalogGrid` control-row layout). A pill
 * trigger opens a short Popover list — "All categories" plus the curated shelf
 * titles — built on the same `@houston-ai/core` Popover + Command primitives the
 * app's `FilterCombobox` uses, so it matches that idiom's look and keyboard/aria
 * behavior. No in-dropdown search: the list is only seven entries. i18n-agnostic
 * per the `ui/` boundary — every string arrives already translated via `labels`.
 */

import {
  Command,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { CATEGORY_ALL } from "./skill-marketplace-state-model";

/** One selectable category: its stable value and its localized display label. */
export interface SkillCategoryOption {
  value: string;
  label: string;
}

export interface SkillCategorySelectLabels {
  /** Label of the default "no filter" row and the trigger's cleared state. */
  allCategories: string;
  /** Accessible name for the trigger button. */
  ariaLabel: string;
}

export interface SkillCategorySelectProps {
  options: SkillCategoryOption[];
  /** The selected option's `value`, or `CATEGORY_ALL` for the default. */
  value: string;
  onChange: (next: string) => void;
  labels: SkillCategorySelectLabels;
  className?: string;
}

export function SkillCategorySelect({
  options,
  value,
  onChange,
  labels,
  className,
}: SkillCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const selected =
    value === CATEGORY_ALL ? undefined : options.find((o) => o.value === value);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={labels.ariaLabel}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border border-line bg-chip px-4 text-[13px] font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/20",
            className,
          )}
        >
          <span className="truncate">
            {selected ? selected.label : labels.allCategories}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-0">
        <Command>
          <CommandList>
            <CommandItem
              value={labels.allCategories}
              onSelect={() => select(CATEGORY_ALL)}
            >
              <span className="flex-1 truncate">{labels.allCategories}</span>
              {value === CATEGORY_ALL && <Check className="size-4 shrink-0" />}
            </CommandItem>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => select(option.value)}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {value === option.value && (
                  <Check className="size-4 shrink-0" />
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
