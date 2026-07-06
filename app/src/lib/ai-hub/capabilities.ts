/**
 * Pure projections of a `CatalogModel` into the small vocabularies the model
 * picker renders: a capability set and a coarse price tier. No React, no i18n,
 * no store/hook imports — deterministic and unit-tested (`capabilities.test.mjs`)
 * so the picker components stay presentational.
 *
 * These derive strictly from fields the catalog actually carries. The base
 * source is the pi-ai catalog (the runnable set); the models.dev snapshot only
 * enriches it. Neither carries an image-generation signal today, so `imageGen`
 * is effectively always false (see `catalog-snapshot.ts` `RawModel`).
 */

import type { CatalogModel } from "./catalog-types.ts";

/**
 * A model's user-facing capability. `vision` = accepts image input;
 * `reasoning` = extended thinking; `tools` = native tool/function calling;
 * `imageGen` = generates images (see module note).
 */
export type ModelCapability = "vision" | "reasoning" | "tools" | "imageGen";

/**
 * The capabilities a catalog model advertises, derived from its real fields.
 * `imageGen` is effectively always false today (no source carries the signal).
 */
export function capabilitiesOf(model: CatalogModel): Set<ModelCapability> {
  const caps = new Set<ModelCapability>();
  if (model.inputModalities.includes("image")) caps.add("vision");
  if (model.reasoning) caps.add("reasoning");
  if (model.toolCall) caps.add("tools");
  if (model.imageGen) caps.add("imageGen");
  return caps;
}

/**
 * Coarse per-token price bucket, from a model's cheapest input price:
 * `free` (exactly $0), `low` (< $1/Mtok), `mid` (< $5/Mtok), `high` (>= $5/Mtok).
 * Returns `undefined` when no offer carries a per-token price — subscription-only
 * or unknown pricing is NOT free, so it gets no tier rather than a wrong one.
 */
export type PriceTier = "free" | "low" | "mid" | "high";

/**
 * The price tier of a model, from the lowest per-1M input price across its
 * offers (`undefined` when none is priced per token). Mirrors the price signal
 * the hub already uses (cheapest input across offers).
 */
export function priceTier(model: CatalogModel): PriceTier | undefined {
  const cheapest = cheapestInputPrice(model);
  if (cheapest === undefined) return undefined;
  if (cheapest === 0) return "free";
  if (cheapest < 1) return "low";
  if (cheapest < 5) return "mid";
  return "high";
}

/** Lowest finite per-1M input price across a model's offers, or undefined. */
function cheapestInputPrice(model: CatalogModel): number | undefined {
  let min: number | undefined;
  for (const offer of model.offers) {
    const price = offer.costInput;
    if (price == null || !Number.isFinite(price)) continue;
    if (min === undefined || price < min) min = price;
  }
  return min;
}
