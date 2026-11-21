import { cn } from "@houston-ai/core";
import { CreditCard, Search, Wallet } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  PROVIDER_QUICK_FILTERS,
  type ProviderQuickFilter,
} from "./provider-filtering.ts";

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
  showQuickFilters = true,
}: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filter: ProviderQuickFilter;
  setFilter: Dispatch<SetStateAction<ProviderQuickFilter>>;
  showQuickFilters?: boolean;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("providers.search")}
          className="h-9 w-full rounded-full border border-line bg-chip pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:bg-input focus:outline-none focus:ring-2 focus:ring-focus/20"
        />
      </div>

      {showQuickFilters && (
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
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20",
                  active
                    ? "border-ink bg-ink text-input"
                    : "border-line bg-chip text-ink hover:bg-card-hover",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(`providers.filter.${key}`)}
              </button>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
