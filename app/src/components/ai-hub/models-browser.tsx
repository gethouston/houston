/**
 * The reusable model browser: the {@link ModelFacets} row (the "AI provider" /
 * "Good at" / "Cost" / "Memory" comboboxes) above the {@link ModelCardRow} list
 * in the shared catalog grammar. Free-text search is EITHER controlled by the
 * page (`query` passed in — the model directory, whose single search field lives
 * up in the page header) OR owned locally as a pill search box (the provider
 * modal, an isolated surface). The directory renders the list as the responsive
 * two-column `CatalogGrid` (`layout="grid"`); the modal keeps a single column
 * (`"list"`, the default — the grid's breakpoint is viewport-based and would
 * cramp two columns into the dialog). Each row opens the model modal via
 * `onOpenModel`; the list caps at one page with a quiet "Show more" pill and
 * shows the shared Empty treatment when every filter + the search rule out
 * everything. Owns all filter state + filtering.
 *
 * The "AI provider" combobox lists only the labs present in the passed `models`
 * and hides itself when they are all one lab; the other three facets always
 * show. Callers pass an already-scoped `models` set + `onOpenModel`.
 */

import {
  CatalogGrid,
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
import type { FilterOption } from "../shell/filter-combobox.tsx";
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
import { ModelFacets } from "./model-facets.tsx";

const PAGE = 60;

export function ModelsBrowser({
  models,
  onOpenModel,
  query: controlledQuery,
  layout = "list",
  className,
}: {
  models: CatalogModel[];
  onOpenModel: (key: string) => void;
  /** When set, search is controlled by the page (the directory's header field)
   *  and the browser hides its own search box; when omitted, the browser owns
   *  a local pill search box (the provider modal). */
  query?: string;
  /** `"grid"` = the responsive two-column catalog grid (the directory);
   *  `"list"` = one column (the provider modal's narrow dialog). */
  layout?: "list" | "grid";
  className?: string;
}) {
  const { t } = useTranslation("aiHub");
  const controlled = controlledQuery !== undefined;
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlled ? controlledQuery : internalQuery;
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
        {!controlled && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={internalQuery}
              onChange={(e) => setInternalQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-full border border-line bg-input pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus/20"
            />
          </div>
        )}

        <ModelFacets
          labOptions={labOptions}
          provider={provider}
          setProvider={setProvider}
          goodAt={goodAt}
          setGoodAt={setGoodAt}
          cost={cost}
          setCost={setCost}
          memory={memory}
          setMemory={setMemory}
        />
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
        <CatalogGrid className={layout === "list" ? "lg:grid-cols-1" : ""}>
          {results.slice(0, visible).map((model) => (
            <ModelCardRow
              key={model.key}
              model={model}
              onOpen={() => onOpenModel(model.key)}
            />
          ))}
        </CatalogGrid>
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
