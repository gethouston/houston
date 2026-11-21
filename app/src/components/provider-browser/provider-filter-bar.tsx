import { cn, useStuckOnScroll } from "@houston-ai/core";
import type { Dispatch, SetStateAction } from "react";
import type { ProviderQuickFilter } from "./provider-filtering";
import { ProviderFilters } from "./provider-filters";

export function ProviderFilterBar({
  query,
  setQuery,
  filter,
  setFilter,
  showQuickFilters = true,
}: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filter: ProviderQuickFilter;
  setFilter: Dispatch<SetStateAction<ProviderQuickFilter>>;
  showQuickFilters?: boolean;
}) {
  const { sentinelRef, stuck } = useStuckOnScroll();
  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <div
        className={cn(
          "sticky top-0 z-20 transition-colors",
          stuck ? "rounded-b-2xl bg-popover shadow-none!" : "",
        )}
      >
        <div className="pt-1 pb-3">
          <ProviderFilters
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
            showQuickFilters={showQuickFilters}
          />
        </div>
      </div>
    </>
  );
}
