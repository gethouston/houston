import type { CatalogModel } from "./catalog-types.ts";

export type ModelCapability = "vision" | "reasoning" | "tools" | "imageGen";

export function capabilitiesOf(model: CatalogModel): Set<ModelCapability> {
  const caps = new Set<ModelCapability>();
  if (model.inputModalities.includes("image")) caps.add("vision");
  if (model.reasoning) caps.add("reasoning");
  if (model.toolCall) caps.add("tools");
  if (model.imageGen) caps.add("imageGen");
  return caps;
}

export type PriceTier = "free" | "low" | "mid" | "high";

export function priceTier(model: CatalogModel): PriceTier | undefined {
  const cheapest = cheapestInputPrice(model);
  if (cheapest === undefined) return undefined;
  if (cheapest === 0) return "free";
  if (cheapest < 1) return "low";
  if (cheapest < 5) return "mid";
  return "high";
}

function cheapestInputPrice(model: CatalogModel): number | undefined {
  let min: number | undefined;
  for (const offer of model.offers) {
    const price = offer.costInput;
    if (price == null || !Number.isFinite(price)) continue;
    if (min === undefined || price < min) min = price;
  }
  return min;
}
