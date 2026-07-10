/**
 * Map the pi-ai provider catalog (`@houston/protocol` `ProviderCatalog`, the
 * host's `GET /v1/catalog` = the RUNNABLE set) into the internal merge candidates
 * the hub folds into unique models. This is the AUTHORITATIVE base source: every
 * model in the hub exists because pi-ai can run it, with pi's own pricing,
 * context window, reasoning, and vision. The models.dev snapshot only enriches
 * these afterwards (see `foldEnrichment`); it never adds a model.
 *
 * Provider ids are put through the SAME renames the frontend uses when hydrating
 * `PROVIDERS` (`DROP_PI_PROVIDERS` first, then `PROVIDER_ID_RENAME`), so an
 * offer's `providerId` + preserved `modelId` reproduce the picker's
 * `${providerId}::${modelId}` key exactly. Nothing is re-hardcoded here.
 */

import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
import {
  DROP_PI_PROVIDERS,
  PROVIDER_ID_RENAME,
  PROVIDER_OVERRIDES,
} from "../provider-overrides.ts";
import { normalizeKey } from "./catalog-key.ts";
import { detectLab } from "./catalog-lab.ts";
import type { Candidate } from "./catalog-merge.ts";
import type { RawModel } from "./catalog-snapshot.ts";

/** One runnable pi model entry → the internal `RawModel` carrier. */
function entryToRaw(entry: CatalogModelEntry): RawModel {
  const raw: RawModel = {
    key: normalizeKey(entry.name),
    id: entry.id,
    name: entry.name,
  };
  if (entry.reasoning) raw.reasoning = true;
  // Vision (image INPUT) rides on the `input` modality list so `capabilitiesOf`
  // derives `vision` the same way it always has.
  if (entry.vision) raw.input = ["text", "image"];
  if (typeof entry.contextWindow === "number")
    raw.context = entry.contextWindow;
  if (typeof entry.maxTokens === "number") raw.output = entry.maxTokens;
  // pi prices are already per-1M-token dollars, the unit the offer surfaces.
  raw.costIn = entry.pricing.input;
  raw.costOut = entry.pricing.output;
  return raw;
}

/**
 * Turn the pi-ai catalog into merge candidates: one per `(provider, model)`,
 * under the renamed Houston provider id, marked `subscription` for OAuth
 * providers (their per-token price is never shown). `detectLab` reads the raw
 * (openrouter `vendor/model` prefixes, then name heuristics) to assign the lab.
 *
 * `visibleIds`, when given, restricts candidates to those (renamed) provider ids
 * — the SAME set `getVisibleProviders` shows the picker, so the AI Models tab and
 * the picker render exactly the same providers (a coming-soon or otherwise-gated
 * provider in the raw catalog never becomes a hub model the picker can't offer).
 *
 * Subscription/OAuth providers (Anthropic, OpenAI/Codex, GitHub Copilot) run
 * ONLY their curated `PROVIDER_OVERRIDES[id].models` set — the plan can't run
 * anything outside it — so pi's full runnable list (pi ships every historical
 * model id it can still talk to, ~24 for Anthropic alone) is filtered down to
 * that curated set here. API-key gateways are unaffected: their full snapshot
 * list is a legitimate "any model this key can run" offer.
 */
export function piCatalogToCandidates(
  catalog: ProviderCatalog,
  visibleIds?: ReadonlySet<string>,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const provider of catalog) {
    if (DROP_PI_PROVIDERS.has(provider.id)) continue;
    const providerId = PROVIDER_ID_RENAME[provider.id] ?? provider.id;
    if (visibleIds && !visibleIds.has(providerId)) continue;
    const subscription = provider.auth === "oauth";
    const curatedIds = subscription
      ? PROVIDER_OVERRIDES[providerId]?.models
      : undefined;
    for (const entry of provider.models) {
      if (curatedIds && !(entry.id in curatedIds)) continue;
      const raw = entryToRaw(entry);
      candidates.push({
        providerId,
        raw,
        subscription,
        lab: detectLab(providerId, raw),
      });
    }
  }
  return candidates;
}
