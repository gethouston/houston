import { Command as CommandPrimitive } from "cmdk";
import { Search, Star } from "lucide-react";
import { cn } from "../../utils";
import type { ModelPickerFilterState } from "./catalog";
import { FilterPopover } from "./filter-popover";
import { SortMenu } from "./sort-menu";
import type {
  ModelCapabilityKey,
  ModelPickerLabels,
  ModelPickerSort,
  ModelPriceTier,
} from "./types";

/** Search field + favorites/filter toggles, and the result-count + sort row. */
export function ModelPickerHeader({
  filter,
  labels,
  matchedCount,
  hasActiveFilter,
  onQueryChange,
  onToggleFavOnly,
  onToggleCap,
  onTogglePriceTier,
  onClearFilters,
  onSortChange,
}: {
  filter: ModelPickerFilterState;
  labels: ModelPickerLabels;
  matchedCount: number;
  hasActiveFilter: boolean;
  onQueryChange: (q: string) => void;
  onToggleFavOnly: () => void;
  onToggleCap: (cap: ModelCapabilityKey) => void;
  onTogglePriceTier: (tier: ModelPriceTier) => void;
  onClearFilters: () => void;
  onSortChange: (sort: ModelPickerSort) => void;
}) {
  const noun = matchedCount === 1 ? labels.model : labels.models;
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <Search className="size-[18px] shrink-0 text-muted-foreground" />
        <CommandPrimitive.Input
          value={filter.query}
          onValueChange={onQueryChange}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={onToggleFavOnly}
          aria-pressed={filter.favOnly}
          title={labels.favoritesOnly}
          aria-label={labels.favoritesOnly}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            filter.favOnly && "bg-primary/10 hover:bg-primary/10",
          )}
          style={filter.favOnly ? { color: "var(--ht-star)" } : undefined}
        >
          <Star
            className="size-[17px]"
            fill={filter.favOnly ? "currentColor" : "none"}
          />
        </button>
        <FilterPopover
          filter={filter}
          labels={labels}
          hasActiveFilter={hasActiveFilter}
          onToggleCap={onToggleCap}
          onTogglePriceTier={onTogglePriceTier}
          onClear={onClearFilters}
        />
      </div>
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 pb-2.5">
        <span className="text-xs text-muted-foreground">
          <b className="font-semibold text-foreground tabular-nums">
            {matchedCount}
          </b>{" "}
          {noun}
        </span>
        <div className="ml-auto">
          <SortMenu
            sort={filter.sort}
            labels={labels}
            onSelect={onSortChange}
          />
        </div>
      </div>
    </>
  );
}
