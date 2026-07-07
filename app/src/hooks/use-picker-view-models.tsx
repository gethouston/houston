/**
 * The memoized derivation half of the chat model picker: turns fetched provider
 * statuses into the picker's model/provider view-models, the selected-row id,
 * catalog freshness, and the trigger's display label. Split from
 * `use-chat-model-picker` so neither the derivation nor the interaction half
 * breaches the file-size budget; the memos live here in one place because the
 * composer footer re-renders on every streamed token.
 */

import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  encodeModelPickerId,
  resolveSelectedModelId,
} from "../lib/chat-model-picker-ids";
import {
  buildPickerModels,
  buildPickerProviders,
} from "../lib/chat-model-picker-map";
import { newEngineActive } from "../lib/engine";
import { osIsTauri } from "../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getModel,
  getProvider,
  getVisibleProviders,
} from "../lib/providers";
import { useCapabilities } from "./use-capabilities";
import { useProviderCatalog } from "./use-provider-catalog";
import { useProviderStatuses } from "./use-provider-statuses";

/** The derived view-models the interaction half renders. */
export interface PickerViewModels {
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  selectedId: string;
  catalogState: "loading" | "ready";
  displayLabel: string;
}

/** Build the picker's view-models for the current selection + open state. */
export function usePickerViewModels(opts: {
  provider: string;
  model: string;
  isOpen: boolean;
}): PickerViewModels {
  const { provider, model, isOpen } = opts;
  const { t } = useTranslation("chat");
  const { statuses, isLoading } = useProviderStatuses();
  const { capabilities } = useCapabilities();
  // The pi-ai catalog hydrates `PROVIDERS` IN PLACE with no React signal, so the
  // `getVisibleProviders` memo below must re-key on `updatedAt` — otherwise the
  // picker stays pinned to the empty override-only seed captured on first render.
  const { isReady: catalogReady, updatedAt: catalogUpdatedAt } =
    useProviderCatalog();

  const newEngine = newEngineActive();
  const desktop = osIsTauri();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  // Memoized on stable inputs (`capabilities` is a stable query ref, the frozen
  // EMPTY constant otherwise), plus `catalogUpdatedAt` so the list rebuilds off
  // the freshly-hydrated `PROVIDERS` the moment the pi-ai catalog resolves —
  // `getVisibleProviders` reads the mutated-in-place cache, invisible to biome.
  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogUpdatedAt keys the in-place PROVIDERS hydration.
  const visibleProviders = useMemo(
    () =>
      getVisibleProviders({
        newEngine,
        desktop,
        capabilities: providerCapabilities,
      }),
    [newEngine, desktop, providerCapabilities, catalogUpdatedAt],
  );

  // Localize a curated row's description via the same `modelDescriptions` key
  // scheme the old dropdown used, falling back to the catalog English.
  const describe = useCallback(
    (_providerId: string, modelId: string, fallback: string) =>
      t(`modelSelector.modelDescriptions.${modelId.replace(/\./g, "_")}`, {
        defaultValue: fallback,
      }),
    [t],
  );

  // Build the (potentially 300+) rows only while the picker is open — the
  // panel is unmounted otherwise, so there is nothing to feed when closed.
  const models = useMemo(
    () =>
      isOpen ? buildPickerModels({ visibleProviders, statuses, describe }) : [],
    [isOpen, visibleProviders, statuses, describe],
  );
  const withModels = useMemo(
    () => new Set(models.map((m) => m.providerId)),
    [models],
  );
  const providers = useMemo(
    () =>
      buildPickerProviders({
        visibleProviders,
        statuses,
        isLoading,
        withModels,
      }),
    [visibleProviders, statuses, isLoading, withModels],
  );

  const selectedId = encodeModelPickerId(
    provider,
    resolveSelectedModelId(
      getProvider(provider),
      model,
      statuses[provider]?.active_model,
    ),
  );
  // The pi-ai catalog is the source of the runnable set, so the picker is
  // "loading" until it resolves and "ready" after. This drives the picker's
  // neutral level-1 loading state (#342 guard) while providers resolve.
  const catalogState: "loading" | "ready" = catalogReady ? "ready" : "loading";

  const currentModel = getModel(provider, model);
  const currentProvider = getProvider(provider);
  const displayLabel =
    currentModel?.label ??
    // A local OpenAI-compatible model isn't in the static catalog, so show the
    // engine-reported configured model id (then the raw selection) rather than
    // falling through to the provider subtitle.
    statuses[provider]?.active_model ??
    (model || undefined) ??
    currentProvider?.subtitle ??
    t("modelSelector.selectModel");

  return { models, providers, selectedId, catalogState, displayLabel };
}
