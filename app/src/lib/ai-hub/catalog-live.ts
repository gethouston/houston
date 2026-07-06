/**
 * Fold the LIVE OpenRouter catalog (`@houston/protocol` `LiveCatalog`, fetched
 * from the host) into the same `RawModel` shape the baked snapshot uses, so the
 * live models flow through the EXACT same merge machinery (`catalog-merge`) as
 * the snapshot: a live offer for an existing model attaches as another
 * `CatalogOffer`, and an OpenRouter-only model becomes a new `CatalogModel`.
 *
 * Every entry is emitted under provider id `"openrouter"` and preserves the
 * upstream `vendor/model` id, so `catalog-lab.ts` `detectLab` reads the vendor
 * prefix and assigns the right lab.
 */

import type { LiveCatalog, LiveCatalogModel } from "@houston/protocol";
import { normalizeKey } from "./catalog-key.ts";
import type { RawModel } from "./catalog-snapshot.ts";

/** One live OpenRouter model → a `RawModel` under provider id `openrouter`. */
function toRaw(live: LiveCatalogModel): RawModel {
  const raw: RawModel = {
    key: normalizeKey(live.name || live.id),
    // Marks this entry as the LIVE OpenRouter fetch so the merge takes its
    // pricing/context over a baked snapshot entry for the same key/provider.
    source: "live",
    id: live.id,
    name: live.name || live.id,
  };
  if (live.description) raw.description = live.description;
  if (typeof live.contextWindow === "number") raw.context = live.contextWindow;
  if (live.capabilities.reasoning) raw.reasoning = true;
  if (live.capabilities.tools) raw.toolCall = true;
  if (live.capabilities.imageGen) raw.imageGen = true;
  // Vision (image INPUT) rides on the same `input` modality list the snapshot
  // uses, so `capabilitiesOf` derives `vision` the same way for both sources.
  if (live.capabilities.vision) raw.input = ["text", "image"];
  // OpenRouter prices are already per-1M-token dollars, the snapshot's unit.
  raw.costIn = live.pricing.inPerMtok;
  raw.costOut = live.pricing.outPerMtok;
  return raw;
}

/**
 * Map a `LiveCatalog` to the OpenRouter `RawModel[]` the catalog merge consumes.
 * Pure: no fetch, no host dependency (the fetch happens in `use-hub-catalog`).
 */
export function liveCatalogToRaw(live: LiveCatalog): RawModel[] {
  return live.map(toRaw);
}
