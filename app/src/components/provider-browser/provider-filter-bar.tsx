/**
 * The {@link ProviderBrowser}'s sticky search + quick-filter bar. Owns its own
 * scroll-stuck state so the browser composition stays lean: transparent at rest,
 * fading in the frosted-glass `bg-popover` fill only once the provider grid
 * scrolls BEHIND it (mirrors the Models tab's pinned bar). Controlled — filter
 * state lives in the parent.
 */

import { cn } from "@houston-ai/core";
import type { Dispatch, SetStateAction } from "react";
import { useStuckOnScroll } from "../../hooks/use-stuck-on-scroll";
import type { ProviderQuickFilter } from "./provider-filtering";
import { ProviderFilters } from "./provider-filters";

export function ProviderFilterBar({
  query,
  setQuery,
  filter,
  setFilter,
}: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filter: ProviderQuickFilter;
  setFilter: Dispatch<SetStateAction<ProviderQuickFilter>>;
}) {
  const { sentinelRef, stuck } = useStuckOnScroll();
  return (
    <>
      {/* Sentinel marking the filter bar's natural top (see useStuckOnScroll). */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* The search + quick-filter bar as ONE sticky unit pinned to the top of
          the shared scroll region, so the provider grid passes cleanly BEHIND
          it. */}
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
          />
        </div>
      </div>
    </>
  );
}
