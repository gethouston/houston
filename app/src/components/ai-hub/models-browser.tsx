/**
 * The reusable model browser: the FULL controls + table the Models tab shows.
 * A search Input plus the "AI provider" / "Good at" dropdowns (DirectoryFilters)
 * AND the ledger's column header share ONE sticky, solid `bg-background` unit so
 * neither disappears on scroll — the rows below pass cleanly BEHIND it. The body
 * (`ModelsLedger`) scrolls horizontally when narrow (e.g. inside the provider
 * modal); an `onScroll` handler mirrors that `scrollLeft` onto the sticky header
 * track so the pinned header stays column-aligned with the rows. Owns the
 * search + lab + good-at filtering. Reused by the Models tab (`ModelDirectory`)
 * and the provider modal so both read identically.
 *
 * The "AI provider" dropdown lists only the labs present in the passed `models`
 * and hides itself when they are all one lab (a single useless option); "Good
 * at" always shows. Callers pass an already-scoped `models` set + `onOpenModel`.
 */

import { cn, Input } from "@houston-ai/core";
import { Search } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../../lib/ai-hub/search.ts";
import {
  cheapestInput,
  costTier,
  fewModels,
  roundedModelCount,
} from "./format.ts";
import {
  DirectoryFilters,
  type GoodAt,
  type ProviderValue,
} from "./model-directory-filters.tsx";
import { LedgerHeader, ModelsLedger } from "./models-ledger.tsx";

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
  const deferredQuery = useDeferredValue(query);

  // Frozen-header sync: the pinned header can't share the body's scroll
  // container without losing its vertical stick, so mirror the body's
  // horizontal scroll onto the header track by hand.
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const onBodyScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const track = headerTrackRef.current;
    if (track) track.scrollLeft = event.currentTarget.scrollLeft;
  }, []);

  const results = useMemo(() => {
    const byFilter = filterModels(models, {
      lab: provider === "all" ? undefined : provider,
      reasoning: goodAt === "reasoning",
      vision: goodAt === "images",
    }).filter(
      (model) =>
        goodAt !== "budget" || costTier(cheapestInput(model.offers)) === 1,
    );
    return searchModels(byFilter, deferredQuery);
  }, [models, provider, goodAt, deferredQuery]);

  const searchPlaceholder = fewModels(models.length)
    ? t("directory.searchFew")
    : t("directory.search", { count: roundedModelCount(models.length) });

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Controls + column header as ONE solid sticky unit: neither disappears
          on scroll, and the rows below pass cleanly BEHIND it (no bleed). */}
      <div className="sticky top-0 z-20 border-border border-b bg-background">
        <div className="flex flex-wrap items-center gap-3 pt-1 pb-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="rounded-full border-border bg-secondary pl-9 focus:bg-background"
            />
          </div>

          <DirectoryFilters
            models={models}
            provider={provider}
            setProvider={setProvider}
            goodAt={goodAt}
            setGoodAt={setGoodAt}
          />
        </div>

        {results.length > 0 && (
          <div ref={headerTrackRef} className="overflow-x-hidden">
            <LedgerHeader />
          </div>
        )}
      </div>

      <ModelsLedger
        models={results}
        onOpenModel={onOpenModel}
        onScroll={onBodyScroll}
      />
    </div>
  );
}
