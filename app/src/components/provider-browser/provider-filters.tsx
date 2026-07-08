/**
 * The Providers-tab filter bar: a search box + a plain-language quick-filter
 * dropdown. The search markup mirrors `ModelsBrowser` (pill input with a leading
 * magnifier) and the Select mirrors the hub's `FilterCombobox` (token-styled
 * pill trigger) so the two tabs read identically. Each option pairs a lucide glyph
 * with a non-technical label so a first-time user can tell the facets apart at a
 * glance. Filter state lives in the parent (`ProviderList`); this owns nothing
 * but its own layout.
 */

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import {
  Coins,
  CreditCard,
  Gift,
  LayoutGrid,
  type LucideIcon,
  Monitor,
  Search,
  Sparkles,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  PROVIDER_QUICK_FILTERS,
  type ProviderQuickFilter,
} from "./provider-filtering.ts";

const TRIGGER =
  "h-9 rounded-full border-border bg-secondary px-4 text-[13px] font-medium text-foreground shadow-none data-[placeholder]:text-muted-foreground focus-visible:ring-2";

/** The lucide glyph paired with each quick-filter facet. */
const FILTER_ICON: Record<ProviderQuickFilter, LucideIcon> = {
  all: LayoutGrid,
  popular: Sparkles,
  subscription: CreditCard,
  free: Gift,
  payg: Coins,
  local: Monitor,
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("providers.search")}
          className="rounded-full border-border bg-secondary pl-9 focus:bg-background"
        />
      </div>

      <Select
        value={filter}
        onValueChange={(value) => setFilter(value as ProviderQuickFilter)}
      >
        <SelectTrigger
          className={TRIGGER}
          aria-label={t("providers.filter.label")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_QUICK_FILTERS.map((key) => {
            const Icon = FILTER_ICON[key];
            return (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <Icon
                    className="size-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  {t(`providers.filter.${key}`)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
