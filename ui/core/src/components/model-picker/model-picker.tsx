"use client";

import { ChevronLeft } from "lucide-react";
import type * as React from "react";
import { useMemo } from "react";
import { cn } from "../../utils";
import { Command, CommandList } from "../command";
import {
  connectedProviderIds,
  modelsForProvider,
  providerListLoading,
  searchModels,
  connectedProviders as selectConnectedProviders,
} from "./catalog";
import { ConnectMore } from "./connect-more";
import { ModelRows } from "./model-list";
import { ProviderList } from "./provider-list";
import { SearchField } from "./search-field";
import { DEFAULT_MODEL_PICKER_LABELS, type ModelPickerProps } from "./types";
import { useModelPicker } from "./use-model-picker";

/**
 * Minimal two-level model picker. Level 1 lists the connected providers; clicking
 * one drills into its models (level 2). The always-visible search field bypasses
 * both levels with a flat ranked list across every connected provider, and
 * clearing it returns to the current level. Disconnected providers never appear —
 * the only path to them is the "Connect more providers…" footer.
 *
 * cmdk (with `shouldFilter={false}`) provides the accessible input, list
 * semantics, and ↑↓/Enter roving; this component owns which rows show. All data
 * comes in as props and all actions go out as callbacks — no store, no i18n.
 */
export function ModelPicker({
  models,
  providers,
  selectedId,
  catalogState = "ready",
  onSelect,
  onConnectMore,
  renderProviderIcon,
  labels: labelsProp,
  className,
}: ModelPickerProps) {
  const labels = { ...DEFAULT_MODEL_PICKER_LABELS, ...labelsProp };
  const { nav, setQuery, enterProvider, back } = useModelPicker();
  const searching = nav.query.trim() !== "";

  const connected = useMemo(
    () => selectConnectedProviders(providers),
    [providers],
  );
  const connectedIds = useMemo(
    () => connectedProviderIds(providers),
    [providers],
  );
  const loading = providerListLoading(providers, catalogState);

  const selectedProviderId = useMemo(
    () => models.find((m) => m.id === selectedId)?.providerId,
    [models, selectedId],
  );

  const searchResults = useMemo(
    () => (searching ? searchModels(models, providers, nav.query) : []),
    [searching, models, providers, nav.query],
  );

  const view = nav.view;
  const providerModels = useMemo(
    () =>
      view.level === "models"
        ? modelsForProvider(models, connectedIds, view.providerId)
        : [],
    [view, models, connectedIds],
  );

  const activeProvider =
    view.level === "models"
      ? connected.find((p) => p.id === view.providerId)
      : undefined;
  const showBack = !searching && activeProvider !== undefined;

  // Escape/Backspace back out of level 2 before Radix closes the popover. An
  // active query is peeled off first (Escape clears the search), then a second
  // Escape (or Backspace on an empty query) steps back to the provider list.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (nav.query !== "") {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
      } else if (nav.view.level === "models") {
        e.preventDefault();
        e.stopPropagation();
        back();
      }
      return;
    }
    if (
      e.key === "Backspace" &&
      nav.query === "" &&
      nav.view.level === "models"
    ) {
      e.preventDefault();
      e.stopPropagation();
      back();
    }
  };

  return (
    <Command
      shouldFilter={false}
      onKeyDown={handleKeyDown}
      className={cn(
        // `h-auto` overrides the wrapper's `h-full` so the picker sizes to its
        // content (the list caps itself at max-h and scrolls).
        "h-auto w-full flex-col overflow-hidden rounded-2xl border border-border shadow-lg",
        className,
      )}
    >
      <SearchField
        value={nav.query}
        placeholder={labels.searchPlaceholder}
        onChange={setQuery}
      />

      {showBack && activeProvider && (
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate text-foreground">
            {activeProvider.name}
          </span>
        </button>
      )}

      <CommandList className="max-h-[360px] overflow-y-auto p-1.5">
        {searching ? (
          searchResults.length > 0 ? (
            <ModelRows
              scope="search"
              ariaLabel={labels.resultsLabel}
              models={searchResults}
              query={nav.query}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {labels.empty}
              <div className="mt-1 text-xs">{labels.emptyHint}</div>
            </div>
          )
        ) : nav.view.level === "providers" ? (
          <ProviderList
            providers={connected}
            loading={loading}
            selectedProviderId={selectedProviderId}
            labels={labels}
            renderProviderIcon={renderProviderIcon}
            onEnter={enterProvider}
          />
        ) : (
          <ModelRows
            scope="models"
            ariaLabel={labels.modelsLabel}
            models={providerModels}
            query=""
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}

        {onConnectMore && (
          <ConnectMore label={labels.connectMore} onSelect={onConnectMore} />
        )}
      </CommandList>
    </Command>
  );
}
