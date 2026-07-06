"use client";

import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../../utils";
import { Command } from "../command";
import { ModelList } from "./model-list";
import { ModelPickerHeader } from "./model-picker-header";
import { ProviderRail, type RailProvider } from "./provider-rail";
import { buildView } from "./sections";
import { DEFAULT_MODEL_PICKER_LABELS, type ModelPickerProps } from "./types";
import { useModelPicker } from "./use-model-picker";

/**
 * Search-first model-picker command menu. Owns its own filtering / sorting /
 * grouping (cmdk runs with `shouldFilter={false}`); cmdk provides the accessible
 * input, list semantics, and ↑/↓/Enter roving. All data comes in as props and
 * all mutations go out as callbacks — no store, no i18n, no app types.
 */
export function ModelPicker({
  models,
  providers,
  favorites,
  recents,
  selectedId,
  catalogState = "ready",
  onSelect,
  onToggleFavorite,
  onConnect,
  renderProviderIcon,
  labels: labelsProp,
  className,
}: ModelPickerProps) {
  const labels = { ...DEFAULT_MODEL_PICKER_LABELS, ...labelsProp };
  const c = useModelPicker();

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const providersMap = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers],
  );
  const providerNames = useMemo(
    () => new Map(providers.map((p) => [p.id, p.name])),
    [providers],
  );

  // Rail entries follow the provider prop order, keeping only providers that
  // actually own models, and carrying a live count badge.
  const railProviders = useMemo<RailProvider[]>(() => {
    const counts = new Map<string, number>();
    for (const m of models) {
      counts.set(m.providerId, (counts.get(m.providerId) ?? 0) + 1);
    }
    return providers
      .filter((p) => (counts.get(p.id) ?? 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        count: counts.get(p.id) ?? 0,
        connection: p.connection,
      }));
  }, [models, providers]);

  // Count favorites the list can actually show (present in `models`), so the rail
  // badge matches the Favorites section — stale favorite ids don't inflate it.
  const favoritesCount = useMemo(
    () => models.reduce((n, m) => n + (favoritesSet.has(m.id) ? 1 : 0), 0),
    [models, favoritesSet],
  );

  const view = useMemo(
    () =>
      buildView(
        models,
        providers.map((p) => p.id),
        providerNames,
        favoritesSet,
        recents,
        c.filter,
      ),
    [models, providers, providerNames, favoritesSet, recents, c.filter],
  );

  const selectedName = models.find((m) => m.id === selectedId)?.name;

  return (
    <Command
      shouldFilter={false}
      className={cn(
        "h-[520px] w-full rounded-2xl border border-border shadow-lg",
        className,
      )}
    >
      <ModelPickerHeader
        filter={c.filter}
        labels={labels}
        matchedCount={view.matchedCount}
        hasActiveFilter={c.hasActiveFilter}
        onQueryChange={c.setQuery}
        onToggleFavOnly={c.toggleFavOnly}
        onToggleCap={c.toggleCap}
        onTogglePriceTier={c.togglePriceTier}
        onClearFilters={c.clearFilters}
        onSortChange={c.setSort}
      />

      {catalogState === "offline" && (
        <div
          className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs"
          style={{
            color: "var(--ht-warning)",
            background:
              "color-mix(in srgb, var(--ht-warning) 12%, transparent)",
          }}
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          {labels.offline}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ProviderRail
          providers={railProviders}
          favoritesCount={favoritesCount}
          totalCount={models.length}
          active={c.filter.provider}
          labels={labels}
          renderProviderIcon={renderProviderIcon}
          onSelect={c.setProvider}
        />
        <ModelList
          view={view}
          providers={providersMap}
          labels={labels}
          catalogState={catalogState}
          query={c.filter.query}
          selectedId={selectedId}
          favorites={favoritesSet}
          openDetailId={c.openDetailId}
          renderProviderIcon={renderProviderIcon}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
          onToggleDetail={c.toggleDetail}
          onConnect={onConnect}
        />
      </div>

      <div className="flex items-center gap-3 border-t border-border/60 bg-secondary px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {labels.selected}{" "}
          <span className="font-semibold text-foreground">
            {selectedName ?? "·"}
          </span>
        </span>
        <span className="ml-auto text-muted-foreground/70">
          {labels.keyboardHint}
        </span>
      </div>
    </Command>
  );
}
