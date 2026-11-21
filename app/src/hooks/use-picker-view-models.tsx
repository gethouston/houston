import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pickerAccountLabel } from "../components/chat-model-selector-labels";
import {
  encodeModelPickerId,
  resolveSelectedModelId,
} from "../lib/chat-model-picker-ids";
import {
  buildPickerModels,
  buildPickerProviders,
} from "../lib/chat-model-picker-map";
import { statusCredentialScope } from "../lib/credential-scope";
import { newEngineActive } from "../lib/engine";
import { modelDisplayLabel } from "../lib/model-labels";
import { osIsTauri } from "../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getProvider,
  getVisibleProviders,
  isOpenCatalogProvider,
} from "../lib/providers";
import { useCapabilities } from "./use-capabilities";
import { useProviderCatalog } from "./use-provider-catalog";
import { useProviderStatuses } from "./use-provider-statuses";

export interface PickerViewModels {
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  selectedId: string;
  catalogState: "loading" | "ready";
  displayLabel: string;
}

export function usePickerViewModels(opts: {
  provider: string;
  model: string;
  isOpen: boolean;
}): PickerViewModels {
  const { provider, model, isOpen } = opts;
  const { t } = useTranslation("chat");
  const { statuses, isLoading } = useProviderStatuses();
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { isReady: catalogReady, updatedAt: catalogUpdatedAt } =
    useProviderCatalog();

  const newEngine = newEngineActive();
  const desktop = osIsTauri();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
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

  const describe = useCallback(
    (providerId: string, modelId: string, fallback: string) => {
      const key = modelId.replace(/\./g, "_");
      return t(`modelSelector.providerModelDescriptions.${providerId}.${key}`, {
        defaultValue: t(`modelSelector.modelDescriptions.${key}`, {
          defaultValue: fallback,
        }),
      });
    },
    [t],
  );

  const accountLabelOf = useCallback(
    (providerId: string) =>
      pickerAccountLabel(t, statusCredentialScope(statuses[providerId])),
    [t, statuses],
  );

  const models = useMemo(
    () =>
      isOpen
        ? buildPickerModels({
            visibleProviders,
            statuses,
            describe,
            accountLabelOf,
          })
        : [],
    [isOpen, visibleProviders, statuses, describe, accountLabelOf],
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
  const catalogState: "loading" | "ready" =
    catalogReady && !capabilitiesLoading ? "ready" : "loading";

  const currentProvider = getProvider(provider);
  const activeModel = isOpenCatalogProvider(provider)
    ? statuses[provider]?.active_model
    : undefined;
  const displayLabel =
    modelDisplayLabel(provider, model, activeModel) ??
    currentProvider?.subtitle ??
    t("modelSelector.selectModel");

  return { models, providers, selectedId, catalogState, displayLabel };
}
