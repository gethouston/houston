/**
 * The house filter combobox: a Popover + cmdk Command picker over a short list
 * of facet options, the same idiom as the Share dialog's "Add people" and the
 * allowed-models editor's lab filter. The trigger is a token pill echoing the
 * current selection (its leading `BrandMark` when the option carries one); the
 * dropdown lists an always-present "clear" row (value `"all"`) then the options,
 * each with a check on the selected one and an optional colorful mark (options
 * with no mark, e.g. app categories, render cleanly without one). An in-dropdown
 * search box appears for long lists (labs, categories) and hides for short
 * facets (cost, memory) — pass `searchable` to force either way.
 *
 * Lives in `shell/` (a neutral home) because three domains now share it with no
 * forked logic: the AI-hub model browser (`aiHub` ns), the teams allowed-models
 * editor (`teams` ns), and the integrations catalog's category filter
 * (`integrations`/`teams` ns). i18n-agnostic: every string (labels, the "all"
 * label, aria + search + empty copy) arrives already translated.
 */

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "../provider-browser/brand-mark.tsx";

/** One selectable facet value; `mark` names a provider/lab whose brand mark leads it. */
export interface FilterOption {
  value: string;
  label: string;
  mark?: string;
}

export function FilterCombobox({
  options,
  value,
  onChange,
  allLabel,
  ariaLabel,
  searchPlaceholder,
  emptyText,
  searchable,
  className,
}: {
  options: FilterOption[];
  /** The selected option's `value`, or `"all"` for the cleared state. */
  value: string;
  onChange: (next: string) => void;
  /** Label of the always-present clear row (its value is `"all"`). */
  allLabel: string;
  ariaLabel: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show an in-dropdown search box. Defaults on once the list runs long (> 8). */
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const withSearch = searchable ?? options.length > 8;
  const selected =
    value === "all" ? undefined : options.find((o) => o.value === value);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-[13px] font-medium text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
            className,
          )}
        >
          {selected?.mark && <OptionMark providerId={selected.mark} />}
          <span className="truncate">
            {selected ? selected.label : allLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          {withSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            {withSearch && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandItem value={allLabel} onSelect={() => select("all")}>
              <span className="flex-1 truncate">{allLabel}</span>
              {value === "all" && <Check className="size-4 shrink-0" />}
            </CommandItem>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => select(option.value)}
              >
                {option.mark && <OptionMark providerId={option.mark} />}
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

/**
 * A provider/lab's colorful mark, sized to the row/trigger. `text-current!`
 * re-inherits the mark's brand color, which the Command item's default `svg`
 * rule (`text-muted-foreground`) would otherwise flatten to gray.
 */
function OptionMark({ providerId }: { providerId: string }) {
  return (
    <BrandMark
      providerId={providerId}
      size="sm"
      className="size-4 [&_svg]:text-current!"
    />
  );
}
