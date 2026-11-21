import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  defaultFilter,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { buildZoneOptions, foldDiacritics } from "./timezone-format.ts";

function filterZones(
  value: string,
  search: string,
  keywords?: string[],
): number {
  return defaultFilter(
    foldDiacritics(value),
    foldDiacritics(search),
    keywords?.map(foldDiacritics),
  );
}

export interface TimezonePickerProps {
  accountTimezone: string;
  onTimezoneChange: (tz: string) => void;
  label: string;
  hint: string;
  searchPlaceholder: string;
  noResults: string;
  variant?: "card" | "bare";
  className?: string;
}

export function TimezonePicker({
  accountTimezone,
  onTimezoneChange,
  label,
  hint,
  searchPlaceholder,
  noResults,
  variant = "card",
  className,
}: TimezonePickerProps) {
  const [open, setOpen] = useState(false);

  const zones = useMemo(
    () => buildZoneOptions(accountTimezone, new Date()),
    [accountTimezone],
  );
  const current = useMemo(
    () => zones.find((z) => z.id === accountTimezone),
    [zones, accountTimezone],
  );

  const currentName = current
    ? current.offset
      ? `${current.display}, ${current.offset}`
      : current.display
    : accountTimezone;

  const handleSelect = (id: string) => {
    if (id !== accountTimezone) onTimezoneChange(id);
    setOpen(false);
  };

  const isBare = variant === "bare";

  const picker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${currentName}`}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-line/20 bg-input px-3 py-2",
            "text-sm text-ink cursor-pointer transition-shadow duration-200",
            "hover:border-line/40 focus:outline-none focus:shadow-sm",
            isBare ? "w-auto max-w-[16rem]" : "w-full",
            isBare && className,
          )}
        >
          <Globe
            className="size-3.5 text-ink-muted shrink-0"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="flex-1 min-w-0 truncate text-left">
            {current?.display ?? accountTimezone}
          </span>
          {current?.offset && (
            <span className="text-xs text-ink-muted shrink-0">
              {current.offset}
            </span>
          )}
          <ChevronDown
            className="size-3.5 text-ink-muted shrink-0"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "p-0",
          isBare ? "w-72" : "w-(--radix-popover-trigger-width)",
        )}
      >
        <Command filter={filterZones}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{noResults}</CommandEmpty>
            {zones.map((zone) => (
              <CommandItem
                key={zone.id}
                value={zone.id}
                keywords={zone.keywords}
                onSelect={() => handleSelect(zone.id)}
              >
                <span className="flex-1 min-w-0 truncate">{zone.display}</span>
                {zone.offset && (
                  <span className="text-xs text-ink-muted shrink-0">
                    {zone.offset}
                  </span>
                )}
                {zone.id === accountTimezone && (
                  <Check className="size-4 shrink-0" />
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (isBare) return picker;

  return (
    <section className={cn("rounded-xl bg-chip px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-xs font-medium text-ink-muted shrink-0">
          {label}
        </span>
        <span className="text-xs text-ink-muted/70 truncate min-w-0">
          {hint}
        </span>
      </div>
      {picker}
    </section>
  );
}
