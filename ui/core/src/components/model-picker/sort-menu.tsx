import { ArrowUpDown, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "../../utils";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { SORT_ORDER } from "./catalog";
import type { ModelPickerLabels, ModelPickerSort } from "./types";

/** Sort trigger showing the active option's short name → menu of the 4 sorts. */
export function SortMenu({
  sort,
  labels,
  onSelect,
}: {
  sort: ModelPickerSort;
  labels: ModelPickerLabels;
  onSelect: (sort: ModelPickerSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const names: Record<ModelPickerSort, string> = {
    relevance: labels.sortRelevance,
    price: labels.sortPrice,
    context: labels.sortContext,
    newest: labels.sortNewest,
  };
  // Trigger shows just the first word to stay compact (e.g. "Price").
  const short = names[sort].split(" ")[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${labels.sort}: ${names[sort]}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
        >
          <ArrowUpDown className="size-3" />
          {short}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1.5">
        {SORT_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onSelect(key);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              key === sort && "text-primary hover:text-primary",
            )}
          >
            <span className="flex-1">{names[key]}</span>
            {key === sort && <Check className="size-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
