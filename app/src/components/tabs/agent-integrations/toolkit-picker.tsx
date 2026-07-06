import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "../../integrations/app-display";

interface ToolkitPickerProps {
  /** The selectable universe (already narrowed to the org ceiling). */
  options: IntegrationToolkit[];
  /** Currently-checked toolkit slugs. */
  selected: ReadonlySet<string>;
  /** Toggle one toolkit in/out of the selection. */
  onToggle: (slug: string) => void;
}

/**
 * A searchable multi-select checklist over the agent's selectable toolkits (the
 * org allowlist ceiling). Managers use it to build an explicit per-agent
 * allowlist. Options list A-Z; a search box filters by app name; each row shows
 * a check when selected. Mirrors the category picker in the shared catalog
 * browser (Popover + Command) so the two read as one system.
 */
export function ToolkitPicker({
  options,
  selected,
  onToggle,
}: ToolkitPickerProps) {
  const { t } = useTranslation("teams");
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...options]
        .map((tk) => appDisplay(tk.slug, tk))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [options],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-background pl-3 pr-2.5 text-sm text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <span>{t("integrations.allowlist.selectApps")}</span>
          {selected.size > 0 && (
            <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums text-muted-foreground">
              {selected.size}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={t("integrations.allowlist.searchApps")} />
          <CommandList>
            <CommandEmpty>{t("integrations.allowlist.noApps")}</CommandEmpty>
            {sorted.map((app) => {
              const isSelected = selected.has(app.toolkit);
              return (
                <CommandItem
                  key={app.toolkit}
                  value={app.name}
                  onSelect={() => onToggle(app.toolkit)}
                >
                  <span className="flex-1 truncate">{app.name}</span>
                  {isSelected && <Check className="size-4" />}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
