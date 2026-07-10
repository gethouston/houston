/**
 * The Providers-tab filter bar: a search box + two Subscription / Pay-as-you-go
 * toggle buttons (a `Select` dropdown here read as needless indirection for a
 * binary choice — a button IS the choice, no menu to open first). The search
 * markup mirrors `ModelsBrowser` (pill input with a leading magnifier). Filter
 * state lives in the parent (`ProviderList`); this owns nothing but its own
 * layout. Single-select: clicking the already-active button clears back to
 * `all`, clicking the other one switches.
 */

import { cn } from "@houston-ai/core";
import { CreditCard, Search, Wallet } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  PROVIDER_QUICK_FILTERS,
  type ProviderQuickFilter,
} from "./provider-filtering.ts";

/** The lucide glyph paired with each quick-filter facet. */
const FILTER_ICON: Record<
  Exclude<ProviderQuickFilter, "all">,
  typeof CreditCard
> = {
  subscription: CreditCard,
  payg: Wallet,
};

export function ProviderFilters({
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
  const { t } = useTranslation("aiHub");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("providers.search")}
          className="h-9 w-full rounded-full border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>

      <fieldset
        aria-label={t("providers.filter.label")}
        className="m-0 flex items-center gap-1.5 border-0 p-0"
      >
        {PROVIDER_QUICK_FILTERS.map((key) => {
          const Icon = FILTER_ICON[key];
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? "all" : key)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-secondary text-foreground hover:bg-card-hover",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {t(`providers.filter.${key}`)}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
