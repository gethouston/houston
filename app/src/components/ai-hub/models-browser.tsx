/**
 * The reusable model browser: the FULL controls + table the Models tab shows.
 * A search Input plus the "AI provider" / "Good at" dropdowns (DirectoryFilters)
 * AND the ledger's column header share ONE sticky unit so neither disappears on
 * scroll — the rows below pass cleanly BEHIND it. The bar is transparent at rest
 * and fades in a frosted-glass `bg-popover` (the blur masks the rows; an opaque
 * fill would slab over the theme) only once it pins on scroll. The body
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
import { useStuckOnScroll } from "./use-stuck-on-scroll.ts";

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

  // Scroll-aware chrome: the sticky bar is transparent while it sits at rest and
  // only fades in its frosted `bg-popover` (+ divider) once rows scroll BEHIND
  // it — see `useStuckOnScroll` (shared with the Providers tab).
  const { sentinelRef, stuck } = useStuckOnScroll();

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
      {/* Sentinel marking the bar's natural top (see the stuck effect above). */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* Controls + column header as ONE sticky unit: neither disappears on
          scroll, and the rows below pass cleanly BEHIND it (no bleed). At rest
          the bar is fully transparent; once pinned it fades in the frosted-glass
          `bg-popover` surface (blur masks the scrolling rows) — just the fill, no
          framing lines: no bottom divider, and `shadow-none!` kills the inset top
          sheen `bg-popover` carries in the futuristic theme. An opaque
          `bg-background` slab here broke the aurora glass screen in dark mode,
          and a permanent fill looked heavy at rest. `rounded-b-2xl` rounds only
          the bottom edge — the pinned bar sits flush under the masthead, so a
          rounded top read as a detached floating slab; the bg + its backdrop
          blur follow the radius. */}
      <div
        className={cn(
          "sticky top-0 z-20 transition-colors",
          stuck ? "rounded-b-2xl bg-popover shadow-none!" : "",
        )}
      >
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
