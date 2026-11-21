import { cn } from "@houston-ai/core";
import { CreditCard, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PROVIDER_QUICK_FILTERS,
  type ProviderQuickFilter,
} from "../provider-browser/provider-filtering";

const FILTER_ICON: Record<
  Exclude<ProviderQuickFilter, "all">,
  typeof CreditCard
> = {
  subscription: CreditCard,
  payg: Wallet,
};

export function ProviderQuickFilterChips({
  filter,
  onFilterChange,
  compact = false,
}: {
  filter: ProviderQuickFilter;
  onFilterChange: (filter: ProviderQuickFilter) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <fieldset
      aria-label={t("providers.filter.label")}
      className="m-0 flex shrink-0 flex-wrap items-center gap-1.5 border-0 p-0"
    >
      {PROVIDER_QUICK_FILTERS.map((key) => {
        const Icon = FILTER_ICON[key];
        const active = filter === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(active ? "all" : key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20",
              compact ? "h-8" : "h-9",
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
  );
}
