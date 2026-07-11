/**
 * The AI models hub's facet layer: the small closed vocabularies the directory
 * filters over (provider, "good at", cost, memory) and the pure projections
 * that map a `CatalogModel` into them. No React, no i18n, no store access —
 * deterministic and unit-tested (`app/tests/ai-hub-facets.test.ts`), so the
 * filter controls stay thin and the bucket thresholds live in one testable
 * place. Display formatting (numbers, dates, ordering) is the sibling
 * `format.ts`; this module is only the filterable dimensions.
 */

import type {
  CatalogModel,
  CatalogOffer,
  LabId,
} from "../../lib/ai-hub/catalog-types.ts";

/** The "AI provider" facet selection: a catalog lab, or `all` for every lab. */
export type ProviderValue = LabId | "all";

/** The "Good at" facet in effect. `all` clears the facet. */
export type GoodAt = "all" | "reasoning" | "images" | "budget";

/** The "Cost" facet bucket. `all` clears the facet. */
export type CostBucket = "all" | "free" | "low" | "mid" | "high";

/** The "Memory" facet bucket. `all` clears the facet. */
export type MemoryBucket = "all" | "small" | "mid" | "long";

/**
 * The budget->premium tier of a per-1M input price: cheap (`< $1`) is `1`, mid
 * (`< $4`) `2`, premium `3`. A missing price (subscription-only, unknown) lands
 * in the middle so it never over- or under-claims. Shared by the directory's
 * "Budget" (Good at) filter and the `costBucket` cost facet so they never
 * disagree.
 */
export function costTier(costInput?: number): 1 | 2 | 3 {
  if (costInput == null || !Number.isFinite(costInput)) return 2;
  if (costInput < 1) return 1;
  if (costInput < 4) return 2;
  return 3;
}

/**
 * The lowest per-1M input price across a model's offers (dollars), or
 * `undefined` when no offer carries a price (subscription-only or unknown).
 * Feeds the "from $X" cost text and the budget tier/filter.
 */
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

/**
 * A model's cost as a coarse bucket for the directory's "Cost" filter, reusing
 * the {@link costTier} thresholds so the cost facet and the "Budget" (Good at)
 * filter never disagree. A genuinely free offer (cheapest per-1M input price of
 * exactly `$0`, e.g. Google's Gemma tier) is its own `free` bucket ABOVE the
 * meter's tiers; otherwise the tier maps `1 → low`, `2 → mid`, `3 → high` (a
 * subscription-only / unknown price lands in `mid`, exactly as the meter shows).
 */
export function costBucket(model: CatalogModel): Exclude<CostBucket, "all"> {
  const cheapest = cheapestInput(model.offers);
  if (cheapest === 0) return "free";
  const tier = costTier(cheapest);
  return tier === 1 ? "low" : tier === 2 ? "mid" : "high";
}

/**
 * A context window as a coarse bucket for the directory's "Memory" filter:
 * `small` below 200K tokens, `mid` from 200K up to (not including) 1M, `long` at
 * or above 1M. Absent context reads as `small` (it never over-claims memory).
 * Reads the same `context` field the model modal's spec chip shows.
 */
export function memoryBucket(
  contextTokens?: number,
): Exclude<MemoryBucket, "all"> {
  if (contextTokens == null || !Number.isFinite(contextTokens)) return "small";
  if (contextTokens < 200_000) return "small";
  if (contextTokens < 1_000_000) return "mid";
  return "long";
}

/**
 * Every lab present in the catalog, most models first (ties break on the lab's
 * proper-noun order for stability). Feeds the "AI provider" filter dropdown, so
 * the options mirror exactly the labs the visible providers actually offer.
 */
export function labsInCatalog(models: readonly CatalogModel[]): LabId[] {
  const counts = new Map<LabId, number>();
  for (const model of models) {
    counts.set(model.lab, (counts.get(model.lab) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lab]) => lab);
}
