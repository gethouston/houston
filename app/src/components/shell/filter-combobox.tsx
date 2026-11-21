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
  value: string;
  onChange: (next: string) => void;
  allLabel: string;
  ariaLabel: string;
  searchPlaceholder?: string;
  emptyText?: string;
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
            "inline-flex h-9 items-center gap-2 rounded-full border border-line bg-chip px-4 text-[13px] font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/20",
            className,
          )}
        >
          {selected?.mark && <OptionMark providerId={selected.mark} />}
          <span className="truncate">
            {selected ? selected.label : allLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-muted" />
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

function OptionMark({ providerId }: { providerId: string }) {
  return (
    <BrandMark
      providerId={providerId}
      size="sm"
      className="size-4 [&_svg]:text-current!"
    />
  );
}
