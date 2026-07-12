/**
 * The reusable model browser: a control stack (a full-width pill search box on
 * its own row, then the "AI provider" / "Good at" / "Cost" / "Memory" facet
 * comboboxes together on a second row, wrapping as a unit on narrow widths so
 * the search box never strands a lone combobox on its own line) above a
 * single-column list of {@link ModelCardRow} cards, the same card idiom as the
 * allowed-models editor. Each card opens the model modal via `onOpenModel`; the
 * grid caps at one page with a quiet "Show more" pill and shows the shared
 * Empty treatment when every filter + the search rule out everything. Owns all
 * filter state + filtering. Reused by the Models tab (`ModelDirectory`) and the
 * provider modal so both read identically.
 *
 * The "AI provider" combobox lists only the labs present in the passed `models`
 * and hides itself when they are all one lab (a single useless option); the
 * other three facets always show. Callers pass an already-scoped `models` set +
 * `onOpenModel`.
 */

import {
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../../lib/ai-hub/search.ts";
import {
  FilterCombobox,
  type FilterOption,
} from "../shell/filter-combobox.tsx";
import {
  type CostBucket,
  cheapestInput,
  costBucket,
  costTier,
  type GoodAt,
  labsInCatalog,
  type MemoryBucket,
  memoryBucket,
  type ProviderValue,
} from "./facets.ts";
import { fewModels, labName, roundedModelCount } from "./format.ts";
import { ModelCardRow } from "./model-card-row.tsx";

const PAGE = 60;

export function ModelsBrowser({
  models,
  onOpenModel,
  className,
}: {
  models: CatalogModel[];
  onOpenModel: (key: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ProviderValue>("all");
  const [goodAt, setGoodAt] = useState<GoodAt>("all");
  const [cost, setCost] = useState<CostBucket>("all");
  const [memory, setMemory] = useState<MemoryBucket>("all");
  const deferredQuery = useDeferredValue(query);

  const labs = useMemo(() => labsInCatalog(models), [models]);
  const labOptions = useMemo<FilterOption[]>(
    () => labs.map((lab) => ({ value: lab, label: labName(lab), mark: lab })),
    [labs],
  );

  const results = useMemo(() => {
    const byFilter = filterModels(models, {
      lab: provider === "all" ? undefined : provider,
      reasoning: goodAt === "reasoning",
      vision: goodAt === "images",
    })
      .filter(
        (model) =>
          goodAt !== "budget" || costTier(cheapestInput(model.offers)) === 1,
      )
      .filter((model) => cost === "all" || costBucket(model) === cost)
      .filter(
        (model) => memory === "all" || memoryBucket(model.context) === memory,
      );
    return searchModels(byFilter, deferredQuery);
  }, [models, provider, goodAt, cost, memory, deferredQuery]);

  // A fresh (filtered) list collapses the cap back to the first page. Adjusting
  // state during render (React's documented pattern) keeps the reset in sync
  // with the new list identity and avoids a wasted paint.
  const [visible, setVisible] = useState(PAGE);
  const [shownFor, setShownFor] = useState(results);
  if (shownFor !== results) {
    setShownFor(results);
    setVisible(PAGE);
  }

  const searchPlaceholder = fewModels(models.length)
    ? t("directory.searchFew")
    : t("directory.search", { count: roundedModelCount(models.length) });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-full border border-line bg-input pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {labs.length > 1 && (
            <FilterCombobox
              ariaLabel={t("directory.filters.provider")}
              allLabel={t("directory.filters.allProviders")}
              searchPlaceholder={t("directory.filters.searchProviders")}
              emptyText={t("directory.filters.noProviders")}
              searchable
              options={labOptions}
              value={provider}
              onChange={(next) => setProvider(next as ProviderValue)}
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
          />
        </div>
      </div>

      {results.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("directory.empty.title")}</EmptyTitle>
            <EmptyDescription>
              {t("directory.empty.description")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {results.slice(0, visible).map((model) => (
            <ModelCardRow
              key={model.key}
              model={model}
              seeMoreLabel={t("directory.seeMore")}
              onOpen={() => onOpenModel(model.key)}
            />
          ))}
        </div>
      )}

      {visible < results.length && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-full bg-chip px-4 py-1.5 font-medium text-ink-muted text-xs transition-colors hover:bg-hover hover:text-ink"
          >
            {t("directory.showMore")}
          </button>
        </div>
      )}
    </div>
  );
}
