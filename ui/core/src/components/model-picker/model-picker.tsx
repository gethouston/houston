"use client";

import { ChevronLeft } from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "../../utils";
import { Command, CommandEmpty, CommandInput, CommandList } from "../command";
import {
  connectedProviderIds,
  modelsForProvider,
  providerListLoading,
  connectedProviders as selectConnectedProviders,
} from "./catalog";
import { ConnectMore } from "./connect-more";
import { ModelRows } from "./model-list";
import { ProviderList } from "./provider-list";
import { DEFAULT_MODEL_PICKER_LABELS, type ModelPickerProps } from "./types";
import { useModelPicker } from "./use-model-picker";

/** Show screen 2's in-dropdown search once the provider's model count clears
 *  this, matching `FilterCombobox`'s heuristic. */
const SEARCH_THRESHOLD = 8;

/**
 * Two-level model picker in the app's shared dropdown idiom (the same Popover +
 * cmdk `Command` chrome as `FilterCombobox`). Level 1 lists the connected
 * providers; clicking one drills into its models (level 2), reached back via the
 * always-visible back header. On level 2 an in-dropdown search appears once the
 * provider's list runs long (> 8 rows) and filters it via cmdk's built-in
 * scorer; short lists omit it. Disconnected providers never appear — the only
 * path to them is the "Connect more providers…" footer.
 *
 * cmdk provides the accessible input, list semantics, and ↑↓/Enter roving; this
 * component owns which rows show. All data comes in as props and all actions go
 * out as callbacks — no store, no i18n.
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
  const showBack = activeProvider !== undefined;

  // Search only on screen 2, once the provider's list runs long — screen 1's
  // connected-provider list stays a short plain menu (FilterCombobox heuristic).
  const withSearch =
    view.level === "models" && providerModels.length > SEARCH_THRESHOLD;
  const ariaLabel =
    view.level === "models" ? labels.modelsLabel : labels.providersLabel;

  // Remount the Command per screen so cmdk's internal search/highlight state
  // never leaks across levels (a stale query would otherwise keep filtering
  // after the input unmounts on back-navigation).
  const commandKey = view.level === "models" ? view.providerId : "providers";

  // cmdk's ↑↓/Enter handler lives on the Command root, so focus must sit inside
  // it: the search input when the screen shows one, else the root itself. Runs
  // per screen (the keyed Command remounts); the host popover must not
  // auto-focus over this (`onOpenAutoFocus` prevented by the consumer).
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: commandKey/withSearch key the remount + input mount this re-focuses after.
  useEffect(() => {
    (inputRef.current ?? rootRef.current)?.focus();
  }, [commandKey, withSearch]);

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
      key={commandKey}
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={cn(
        // `h-auto` overrides the wrapper's `h-full` so the picker sizes to its
        // content (the list caps itself at max-h and scrolls). The popover
        // supplies the border/shadow/radius, matching `FilterCombobox`.
        "h-auto w-full flex-col outline-none",
        className,
      )}
    >
      {showBack && activeProvider && (
        <button
          type="button"
          aria-label={labels.back}
          onClick={back}
          className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-left text-xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate text-ink">{activeProvider.name}</span>
        </button>
      )}

      {withSearch && (
        <CommandInput
          ref={inputRef}
          value={nav.query}
          onValueChange={setQuery}
          placeholder={labels.searchPlaceholder}
        />
      )}

      <CommandList aria-label={ariaLabel} className="max-h-[360px] p-1">
        {withSearch && <CommandEmpty>{labels.empty}</CommandEmpty>}
        {view.level === "providers" ? (
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
            models={providerModels}
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
