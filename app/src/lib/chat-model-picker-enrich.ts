/**
 * Enrichment helpers for the chat model picker: project catalog capabilities +
 * economics onto a picker row, and decide the "New" recency badge. Split from
 * `chat-model-picker-map.ts` so the mapping module stays under the file-size
 * budget; all pure and unit-testable without a React renderer.
 */

import type { ModelCapabilityKey, ModelPickerModel } from "@houston-ai/core";
import {
  capabilitiesOf,
  type ModelCapability,
  priceTier,
} from "./ai-hub/capabilities.ts";
import type {
  CatalogModel,
  CatalogOffer,
  HubCatalog,
} from "./ai-hub/catalog-types.ts";
import { encodeModelPickerId } from "./chat-model-picker-ids.ts";

/** A model counts as "new" when released within this window of `now`. */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether a catalogued model was released recently enough to badge "New".
 * Future-dated releases are excluded (a not-yet-shipped model is not "new"),
 * and an unparseable/absent date is simply not new. `now` is injected so the
 * mapping stays deterministic under test.
 *
 * NOTE: live OpenRouter entries carry no release date (the host mapper omits
 * `isNew`), so OpenRouter recency is snapshot(`releaseDate`)-derived only.
 */
export function isRecentRelease(
  releaseDate: string | undefined,
  now: number,
): boolean {
  if (!releaseDate) return false;
  const at = Date.parse(releaseDate);
  if (Number.isNaN(at)) return false;
  return at <= now && now - at <= NEW_WINDOW_MS;
}

/** Project the catalog's capability set into the picker's boolean record. */
export function capabilityRecord(
  caps: Set<ModelCapability>,
): Record<ModelCapabilityKey, boolean> {
  return {
    vision: caps.has("vision"),
    reasoning: caps.has("reasoning"),
    tools: caps.has("tools"),
    imageGen: caps.has("imageGen"),
  };
}

/** No advertised capabilities — the graceful default when a model isn't found. */
export function noCapabilities(): Record<ModelCapabilityKey, boolean> {
  return { vision: false, reasoning: false, tools: false, imageGen: false };
}

/** Where a specific (provider, model) offer lives in the catalog. */
export interface OfferHit {
  model: CatalogModel;
  offer: CatalogOffer;
}

/**
 * Index every catalog offer by its `${providerId}::${modelId}` so a curated
 * provider row can be enriched by exact provider-native id (not a fuzzy name
 * match) in O(1). Empty when the catalog hasn't loaded yet.
 */
export function buildOfferIndex(
  catalog: HubCatalog | undefined,
): Map<string, OfferHit> {
  const index = new Map<string, OfferHit>();
  if (!catalog) return index;
  for (const model of catalog.models)
    for (const offer of model.offers)
      index.set(encodeModelPickerId(offer.providerId, offer.modelId), {
        model,
        offer,
      });
  return index;
}

/** Enrich a base picker model from a matched catalog offer. */
export function enrich(
  base: ModelPickerModel,
  { model, offer }: OfferHit,
  now: number,
): ModelPickerModel {
  return {
    ...base,
    capabilities: capabilityRecord(capabilitiesOf(model)),
    priceTier: priceTier(model),
    priceInPerMtok: offer.costInput,
    priceOutPerMtok: offer.costOutput,
    contextWindow: offer.context ?? model.context ?? base.contextWindow,
    isNew: isRecentRelease(model.releaseDate, now),
  };
}
