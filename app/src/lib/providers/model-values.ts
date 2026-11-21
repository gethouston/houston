import { modelInputLimit } from "@houston/protocol/model-windows";
import { legacyModelAlias } from "@houston/sdk/provider-catalog";
import { getProvider, isOpenCatalogProvider } from "./lookup.ts";
import {
  type ContextWindowConfig,
  DEFAULT_EFFORT,
  type EffortLevel,
  type ModelOption,
} from "./types.ts";

export function getModel(
  providerId: string,
  modelId: string,
): ModelOption | undefined {
  const provider = getProvider(providerId);
  return (
    provider?.models.find((m) => m.id === modelId) ??
    provider?.hiddenModels?.find((m) => m.id === modelId)
  );
}

export function getDefaultModel(providerId: string): string {
  return getProvider(providerId)?.defaultModel ?? "";
}

export function getContextWindowConfig(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): ContextWindowConfig | undefined {
  if (!providerId || !modelId) return undefined;
  const model = getModel(providerId, modelId);
  if (model?.contextWindow == null) return undefined;
  const inputLimit = modelInputLimit(modelId);
  return {
    default: model.contextWindow,
    max: model.contextWindowMax ?? model.contextWindow,
    ...(inputLimit === undefined ? {} : { inputLimit }),
  };
}

export function validModelOrNull(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): string | null {
  if (!providerId || !modelId) return null;
  if (isOpenCatalogProvider(providerId)) return modelId;
  return getModel(providerId, modelId) ? modelId : null;
}

export function modelAcceptsImages(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): boolean | undefined {
  if (!providerId || !modelId) return undefined;
  return getModel(providerId, modelId)?.acceptsImages;
}

export function normalizeLegacyModel(
  model: string | null | undefined,
  provider: string | null | undefined,
): string | null {
  if (!model) return null;
  return legacyModelAlias(provider, model) ?? model;
}

export function getEffortLevels(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): readonly EffortLevel[] {
  if (!providerId || !modelId) return [];
  return getModel(providerId, modelId)?.effortLevels ?? [];
}

export function normalizeEffort(
  effort: string | null | undefined,
): string | null | undefined {
  return effort === "max" ? "xhigh" : effort;
}

export function validEffortOrDefault(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
  effort: string | null | undefined,
): EffortLevel | undefined {
  const levels = getEffortLevels(providerId, modelId);
  if (levels.length === 0) return undefined;
  const normalized = normalizeEffort(effort);
  if (normalized && levels.includes(normalized as EffortLevel))
    return normalized as EffortLevel;
  return levels.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : levels[0];
}
