import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
import { resolveModelWindow } from "@houston/protocol/model-windows";
import {
  DEFAULT_MODEL,
  modelDisplayName,
  toCanonicalProviderId,
  VALID_MODELS,
} from "@houston/sdk/provider-catalog";
import { normalizeKey } from "../ai-hub/catalog-key.ts";
import { isModelVisible } from "../provider-overrides/pi-catalog-filters.ts";
import type { ProviderOverride } from "../provider-overrides/types.ts";
import type { EffortLevel, ModelOption, ProviderInfo } from "./types.ts";

const PI_EFFORT_MAP: Readonly<Record<string, EffortLevel>> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
};

export function deriveEffortLevels(
  thinkingLevels: string[] | undefined,
  reasoning: boolean,
): EffortLevel[] {
  if (!reasoning || !thinkingLevels) return [];
  const out: EffortLevel[] = [];
  for (const level of thinkingLevels) {
    const mapped = PI_EFFORT_MAP[level];
    if (mapped) out.push(mapped);
  }
  return out;
}

function dedupeModelEntries(
  entries: readonly CatalogModelEntry[],
): CatalogModelEntry[] {
  const indexByKey = new Map<string, number>();
  const out: CatalogModelEntry[] = [];
  for (const entry of entries) {
    const key = normalizeKey(entry.name);
    const at = indexByKey.get(key);
    if (at === undefined) {
      indexByKey.set(key, out.length);
      out.push(entry);
      continue;
    }
    const kept = out[at];
    const cleaner =
      entry.id.length < kept.id.length ||
      (entry.id.length === kept.id.length && entry.id < kept.id);
    if (cleaner) out[at] = entry;
  }
  return out;
}

function catalogDefaultModel(houstonId: string): string | undefined {
  return DEFAULT_MODEL[toCanonicalProviderId(houstonId)];
}

export function defaultModelFor(
  houstonId: string,
  models: readonly ModelOption[],
): string {
  return catalogDefaultModel(houstonId) ?? models[0]?.id ?? "";
}

export function buildProvider(
  piProvider: ProviderCatalog[number],
  finalId: string,
  override: ProviderOverride | undefined,
): ProviderInfo {
  const canonicalId = toCanonicalProviderId(finalId);
  const visibleEntries = piProvider.models.filter((entry) =>
    isModelVisible(finalId, entry.id),
  );
  const toOption = (entry: CatalogModelEntry): ModelOption => {
    const mo = override?.models?.[entry.id];
    const effort =
      mo?.effortLevels ??
      deriveEffortLevels(entry.thinkingLevels, entry.reasoning);
    const window = resolveModelWindow(
      piProvider.id,
      entry.id,
      entry.contextWindow,
    );
    return {
      id: entry.id,
      label: modelDisplayName(canonicalId, entry.id) ?? entry.name,
      description: mo?.description ?? "",
      acceptsImages: entry.vision === true,
      contextWindow: window.default,
      contextWindowMax: window.max !== window.default ? window.max : undefined,
      effortLevels: effort.length > 0 ? effort : undefined,
    };
  };
  const models = dedupeModelEntries(visibleEntries).map(toOption);
  const runnable = (VALID_MODELS as Record<string, ReadonlySet<string>>)[
    canonicalId
  ];
  const hiddenModels = piProvider.models
    .filter((e) => !isModelVisible(finalId, e.id) && runnable?.has(e.id))
    .map(toOption);
  return {
    id: finalId,
    name: override?.name ?? piProvider.name,
    subtitle: override?.subtitle ?? "",
    installUrl: override?.installUrl ?? "",
    cost: override?.cost ?? "",
    models,
    hiddenModels,
    defaultModel: defaultModelFor(finalId, models),
    auth: override?.auth ?? (piProvider.auth === "oauth" ? "oauth" : "apiKey"),
    apiKeyUrl: override?.apiKeyUrl,
    copilotConnect: override?.copilotConnect,
    gatewayIds: override?.gatewayIds,
  };
}
