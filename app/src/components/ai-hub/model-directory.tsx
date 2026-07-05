/**
 * The directory of every model Houston can reach: a search box, a row of
 * filter chips (All, the top labs by model count, plus Reasoning and Vision),
 * and the model list. Search is deferred to keep typing smooth; the list caps
 * at 60 rows with a "Show more" pill that reveals 60 more.
 */

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
} from "@houston-ai/core";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CatalogModel,
  HubCatalog,
  LabId,
} from "../../lib/ai-hub/catalog-types.ts";
import {
  filterModels,
  type ModelFilter,
  searchModels,
} from "../../lib/ai-hub/search.ts";
import { fewModels, labName, roundedModelCount } from "./format.ts";
import { ModelRow } from "./model-row.tsx";

const PAGE = 60;
const ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

export function ModelDirectory({
  catalog,
  onOpenModel,
}: {
  catalog: HubCatalog;
  onOpenModel: (model: CatalogModel) => void;
}) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ModelFilter>({});
  const [visible, setVisible] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);

  const topLabs = useMemo(
    () => topLabsByCount(catalog.models),
    [catalog.models],
  );
  const results = useMemo(
    () => searchModels(filterModels(catalog.models, filter), deferredQuery),
    [catalog.models, filter, deferredQuery],
  );

  // A new query or filter collapses the list back to the first page. Adjusting
  // state during render (React's documented pattern) instead of an effect keeps
  // the reset synchronous with the new results and avoids a wasted paint.
  const queryKey = `${deferredQuery}|${filter.lab ?? ""}|${filter.reasoning ? 1 : 0}|${filter.vision ? 1 : 0}`;
  const [shownFor, setShownFor] = useState(queryKey);
  if (shownFor !== queryKey) {
    setShownFor(queryKey);
    setVisible(PAGE);
  }

  const shown = results.slice(0, visible);
  const searchPlaceholder = fewModels(catalog.modelCount)
    ? t("directory.searchFew")
    : t("directory.search", { count: roundedModelCount(catalog.modelCount) });
  const noFilter = !filter.lab && !filter.reasoning && !filter.vision;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="rounded-full border-border bg-secondary pl-9 focus:bg-background"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip selected={noFilter} onClick={() => setFilter({})}>
          {t("directory.filters.all")}
        </Chip>
        {topLabs.map((lab) => (
          <Chip
            key={lab}
            selected={filter.lab === lab}
            onClick={() =>
              setFilter((f) => ({ ...f, lab: f.lab === lab ? undefined : lab }))
            }
          >
            {labName(lab)}
          </Chip>
        ))}
        <Chip
          selected={!!filter.reasoning}
          onClick={() => setFilter((f) => ({ ...f, reasoning: !f.reasoning }))}
        >
          {t("directory.filters.reasoning")}
        </Chip>
        <Chip
          selected={!!filter.vision}
          onClick={() => setFilter((f) => ({ ...f, vision: !f.vision }))}
        >
          {t("directory.filters.vision")}
        </Chip>
      </div>

      {shown.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("directory.empty.title")}</EmptyTitle>
            <EmptyDescription>
              {t("directory.empty.description")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-0.5">
          <AnimatePresence mode="popLayout" initial={false}>
            {shown.map((model) => (
              <motion.div key={model.key} layout {...ENTER}>
                <ModelRow model={model} onOpen={onOpenModel} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {visible < results.length && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-full bg-secondary px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("directory.showMore")}
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        selected
          ? "bg-foreground text-background"
          : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** The labs present in the catalog, most models first, capped at eight. */
function topLabsByCount(models: readonly CatalogModel[]): LabId[] {
  const counts = new Map<LabId, number>();
  for (const model of models) {
    counts.set(model.lab, (counts.get(model.lab) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lab]) => lab);
}
