import type {
  CatalogModel,
  CatalogOffer,
  LabId,
} from "../../lib/ai-hub/catalog-types.ts";

export type ProviderValue = LabId | "all";

export type GoodAt = "all" | "reasoning" | "images" | "budget";

export type CostBucket = "all" | "free" | "low" | "mid" | "high";

export type MemoryBucket = "all" | "small" | "mid" | "long";

export function costTier(costInput?: number): 1 | 2 | 3 {
  if (costInput == null || !Number.isFinite(costInput)) return 2;
  if (costInput < 1) return 1;
  if (costInput < 4) return 2;
  return 3;
}

export function cheapestInput(
  offers: readonly CatalogOffer[],
): number | undefined {
  let min: number | undefined;
  for (const offer of offers) {
    if (offer.costInput == null || !Number.isFinite(offer.costInput)) continue;
    if (min == null || offer.costInput < min) min = offer.costInput;
  }
  return min;
}

export function costBucket(model: CatalogModel): Exclude<CostBucket, "all"> {
  const cheapest = cheapestInput(model.offers);
  if (cheapest === 0) return "free";
  const tier = costTier(cheapest);
  return tier === 1 ? "low" : tier === 2 ? "mid" : "high";
}

export function memoryBucket(
  contextTokens?: number,
): Exclude<MemoryBucket, "all"> {
  if (contextTokens == null || !Number.isFinite(contextTokens)) return "small";
  if (contextTokens < 200_000) return "small";
  if (contextTokens < 1_000_000) return "mid";
  return "long";
}

export function labsInCatalog(models: readonly CatalogModel[]): LabId[] {
  const counts = new Map<LabId, number>();
  for (const model of models) {
    counts.set(model.lab, (counts.get(model.lab) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lab]) => lab);
}
