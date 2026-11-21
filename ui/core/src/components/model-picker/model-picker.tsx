"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "../../utils";
import { Command, CommandEmpty, CommandInput, CommandList } from "../command";
import {
  connectedProviderIds,
  emptyStateAction,
  modelsForProvider,
  providerListEmpty,
  providerListLoading,
  connectedProviders as selectConnectedProviders,
} from "./catalog";
import { ConnectMore } from "./connect-more";
import { ModelRows } from "./model-list";
import { ProviderList } from "./provider-list";
import { DEFAULT_MODEL_PICKER_LABELS, type ModelPickerProps } from "./types";
import { useModelPicker } from "./use-model-picker";

const SEARCH_THRESHOLD = 8;

export function ModelPicker({
  models,
  providers,
  selectedId,
  catalogState = "ready",
  onSelect,
  onConnectMore,
  onEmptyStateAction,
  renderProviderIcon,
  labels: labelsProp,
  footer,
  className,
}: ModelPickerProps) {
  const labels = { ...DEFAULT_MODEL_PICKER_LABELS, ...labelsProp };
  const { nav, setQuery, enterProvider, back, handleKeyDown } =
    useModelPicker();

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
  const showEmptyState =
    view.level === "providers" && providerListEmpty(providers, catalogState);
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

  const withSearch =
    view.level === "models" && providerModels.length > SEARCH_THRESHOLD;
  const ariaLabel =
    view.level === "models" ? labels.modelsLabel : labels.providersLabel;

  const commandKey = view.level === "models" ? view.providerId : "providers";

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: commandKey/withSearch key the remount + input mount this re-focuses after.
  useEffect(() => {
    (inputRef.current ?? rootRef.current)?.focus();
  }, [commandKey, withSearch]);

  return (
    <Command
      key={commandKey}
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={cn("h-auto w-full flex-col outline-none", className)}
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
            onConnect={emptyStateAction(onEmptyStateAction, onConnectMore)}
          />
        ) : (
          <ModelRows
            models={providerModels}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}

        {onConnectMore && !showEmptyState && (
          <ConnectMore label={labels.connectMore} onSelect={onConnectMore} />
        )}

        {footer && (
          <div className="mt-1 border-t border-line/60 px-2 py-1.5 text-xs text-ink-muted">
            {footer}
          </div>
        )}
      </CommandList>
    </Command>
  );
}
