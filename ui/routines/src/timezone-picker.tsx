/**
 * TimezonePicker — account-wide IANA timezone selector.
 *
 * Replaces the old native `<select>` (which popped the OS-native option list
 * occupying the full window height and offered no search) with a searchable
 * combobox in the same idiom as the app's integration browser: a button trigger
 * opening a small Popover whose Command lets the user type keywords ("tokyo",
 * "new york", "gmt+5") to narrow ~400 zones. See HOU-496.
 *
 * Two variants share one trigger + popover: `"card"` keeps the gray panel with
 * its title + hint row (so the control reads as "this one zone governs every
 * routine below"); `"bare"` drops all card chrome and renders just the trigger
 * button, sized to sit inline in a toolbar.
 */

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

/**
 * Accent-insensitive wrapper around cmdk's default scorer: fold the query and
 * the item (value + keywords) before scoring, so "são paulo" matches "Sao
 * Paulo". cmdk only normalizes case/whitespace, not diacritics.
 */
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
  /** The persisted account-wide IANA zone. */
  accountTimezone: string;
  /** Persist a newly chosen zone. */
  onTimezoneChange: (tz: string) => void;
  /** Card title + accessible name for the trigger. */
  label: string;
  /** One-line hint shown beside the title. */
  hint: string;
  /** Placeholder for the in-popover search field. */
  searchPlaceholder: string;
  /** Shown when no zone matches the query. */
  noResults: string;
  /**
   * `"card"` (default) wraps the trigger in the titled gray panel; `"bare"`
   * renders only the trigger button for inline/toolbar placement.
   */
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

  // Built once: ~400 zones with offset + keywords. The account zone is always
  // present, so `current` resolves even if the platform list omits it.
  const zones = useMemo(
    () => buildZoneOptions(accountTimezone, new Date()),
    [accountTimezone],
  );
  const current = useMemo(
    () => zones.find((z) => z.id === accountTimezone),
    [zones, accountTimezone],
  );

  // The button's visible text is the live value, so give it an accessible name
  // that pairs the field label WITH that value, e.g. "Timezone: America/New
  // York, GMT-4". A bare aria-label of just `label` would hide the chosen zone
  // from screen readers (aria-label overrides the visible text).
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
          // A bare trigger is narrow, so pin the list to a readable fixed width
          // instead of matching the trigger.
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

  // Bare: just the trigger + popover, for inline/toolbar placement.
  if (isBare) return picker;

  return (
    <section className={cn("rounded-xl bg-chip px-5 py-4", className)}>
      {/* Title + hint share one row so the card stays short. */}
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
