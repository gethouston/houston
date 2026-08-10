/**
 * The model directory's facet row: the "AI provider" / "Good at" / "Cost" /
 * "Memory" comboboxes that narrow the {@link ModelsBrowser} list alongside the
 * page's free-text search. The provider combobox is passed in via `labOptions`
 * and hides itself when the catalog is all one lab (a single useless option);
 * the other three always show. Presentational — the browser owns the state.
 */

import { useTranslation } from "react-i18next";
import {
  FilterCombobox,
  type FilterOption,
} from "../shell/filter-combobox.tsx";
import type {
  CostBucket,
  GoodAt,
  MemoryBucket,
  ProviderValue,
} from "./facets.ts";

export function ModelFacets({
  labOptions,
  provider,
  setProvider,
  goodAt,
  setGoodAt,
  cost,
  setCost,
  memory,
  setMemory,
  compact = false,
}: {
  labOptions: FilterOption[];
  provider: ProviderValue;
  setProvider: (value: ProviderValue) => void;
  goodAt: GoodAt;
  setGoodAt: (value: GoodAt) => void;
  cost: CostBucket;
  setCost: (value: CostBucket) => void;
  memory: MemoryBucket;
  setMemory: (value: MemoryBucket) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {labOptions.length > 1 && (
        <FilterCombobox
          ariaLabel={t("directory.filters.provider")}
          allLabel={t("directory.filters.allProviders")}
          searchPlaceholder={t("directory.filters.searchProviders")}
          emptyText={t("directory.filters.noProviders")}
          searchable
          options={labOptions}
          value={provider}
          onChange={(next) => setProvider(next as ProviderValue)}
          className={compact ? "h-8" : undefined}
        />
      )}
      <FilterCombobox
        ariaLabel={t("directory.filters.goodAt")}
        allLabel={t("directory.filters.allSpecialties")}
        options={[
          { value: "reasoning", label: t("directory.filters.reasoning") },
          { value: "images", label: t("directory.filters.images") },
          { value: "budget", label: t("directory.filters.budget") },
        ]}
        value={goodAt}
        onChange={(next) => setGoodAt(next as GoodAt)}
        className={compact ? "h-8" : undefined}
      />
      <FilterCombobox
        ariaLabel={t("directory.filters.cost")}
        allLabel={t("directory.filters.costAll")}
        options={[
          { value: "free", label: t("directory.filters.costFree") },
          { value: "low", label: t("directory.filters.costLow") },
          { value: "mid", label: t("directory.filters.costMid") },
          { value: "high", label: t("directory.filters.costHigh") },
        ]}
        value={cost}
        onChange={(next) => setCost(next as CostBucket)}
        className={compact ? "h-8" : undefined}
      />
      <FilterCombobox
        ariaLabel={t("directory.filters.memory")}
        allLabel={t("directory.filters.memoryAll")}
        options={[
          { value: "small", label: t("directory.filters.memorySmall") },
          { value: "mid", label: t("directory.filters.memoryMid") },
          { value: "long", label: t("directory.filters.memoryLong") },
        ]}
        value={memory}
        onChange={(next) => setMemory(next as MemoryBucket)}
        className={compact ? "h-8" : undefined}
      />
    </div>
  );
}
