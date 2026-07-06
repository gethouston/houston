/**
 * Pure mapping from Houston's provider/model catalog into the generic
 * `ModelPickerModel` / `ModelPickerProvider` view-models the `@houston-ai/core`
 * `ModelPicker` renders. Split out from `ChatModelSelector` so the (non-trivial)
 * runnable-pair logic is unit-testable without a React renderer and the
 * container stays under the file-size budget.
 *
 * The one hard invariant: the picker must only ever offer RUNNABLE
 * (provider, model) pairs, so this NEVER drives providers blindly from the
 * catalog. Non-OpenRouter providers enumerate their curated `PROVIDERS[].models`
 * (plus the synthesized dynamic row for the local `openai-compatible` provider,
 * exactly like the old dropdown), enriched from the Wave-2 hub catalog when a
 * matching offer is found. OpenRouter is the 300+ case: its rows come from the
 * merged catalog's `byProvider("openrouter")` bucket, which the baked snapshot
 * fills once the catalog loads (folding in any live OpenRouter fetch on top).
 * Only while the catalog is still loading (cold start) does the curated
 * OpenRouter list stand in, so the provider is never presented empty.
 */

import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import { capabilitiesOf, priceTier } from "./ai-hub/capabilities.ts";
import type { HubCatalog } from "./ai-hub/catalog-types.ts";
import {
  buildOfferIndex,
  capabilityRecord,
  enrich,
  isRecentRelease,
  noCapabilities,
  type OfferHit,
} from "./chat-model-picker-enrich.ts";
import { encodeModelPickerId } from "./chat-model-picker-ids.ts";
import {
  type ProviderConnection,
  pickerModelRows,
  providerPickerState,
} from "./model-picker.ts";
import { getContextWindowConfig, type ProviderInfo } from "./providers.ts";

/** Every OpenRouter model in the merged catalog as a runnable picker row. */
function openRouterModels(
  catalog: HubCatalog | undefined,
  now: number,
): ModelPickerModel[] {
  if (!catalog) return [];
  const out: ModelPickerModel[] = [];
  for (const model of catalog.byProvider.get("openrouter") ?? []) {
    const offer = model.offers.find((o) => o.providerId === "openrouter");
    if (!offer) continue;
    out.push({
      id: encodeModelPickerId("openrouter", offer.modelId),
      providerId: "openrouter",
      name: model.name,
      description: model.description,
      capabilities: capabilityRecord(capabilitiesOf(model)),
      priceTier: priceTier(model),
      priceInPerMtok: offer.costInput,
      priceOutPerMtok: offer.costOutput,
      contextWindow: offer.context ?? model.context,
      isNew: isRecentRelease(model.releaseDate, now),
    });
  }
  return out;
}

/** The engine-reported runtime model for a catalog-less (local) provider. */
type StatusModel = { active_model?: string };

/**
 * A provider's curated `PROVIDERS[].models` as runnable picker rows (including
 * the synthesized dynamic row for the local `openai-compatible` provider),
 * each enriched from the catalog when a matching offer exists. Used for every
 * non-OpenRouter provider, and as OpenRouter's stand-in while the catalog is
 * still loading (cold start) so the provider is never presented empty.
 */
function curatedProviderModels(
  p: ProviderInfo,
  statuses: Record<string, StatusModel | undefined>,
  offerIndex: Map<string, OfferHit>,
  now: number,
  describe:
    | ((providerId: string, modelId: string, fallback: string) => string)
    | undefined,
): ModelPickerModel[] {
  const out: ModelPickerModel[] = [];
  const rows = pickerModelRows(
    p.models,
    statuses[p.id]?.active_model,
    p.subtitle,
  );
  for (const row of rows) {
    const id = encodeModelPickerId(p.id, row.id);
    const base: ModelPickerModel = {
      id,
      providerId: p.id,
      name: row.label,
      description: describe
        ? describe(p.id, row.id, row.description)
        : row.description,
      capabilities: noCapabilities(),
      contextWindow: getContextWindowConfig(p.id, row.id)?.default,
    };
    const hit = offerIndex.get(id);
    out.push(hit ? enrich(base, hit, now) : base);
  }
  return out;
}

/**
 * Build the picker's full model list. Non-OpenRouter providers enumerate their
 * curated rows (via `pickerModelRows`, so the local provider's dynamic row is
 * included) and enrich from the catalog when a matching offer exists; OpenRouter
 * is sourced from the merged catalog. `describe` localizes a curated row's
 * description (falling back to the catalog English), mirroring the old
 * dropdown's `modelDescriptions` lookup.
 */
export function buildPickerModels(opts: {
  visibleProviders: readonly ProviderInfo[];
  statuses: Record<string, StatusModel | undefined>;
  catalog: HubCatalog | undefined;
  now: number;
  describe?: (providerId: string, modelId: string, fallback: string) => string;
}): ModelPickerModel[] {
  const offerIndex = buildOfferIndex(opts.catalog);
  const models: ModelPickerModel[] = [];
  for (const p of opts.visibleProviders) {
    if (p.id === "openrouter") {
      // The 300+ case: source OpenRouter from the merged catalog. Its bucket is
      // filled by the baked snapshot as soon as the catalog loads (offline /
      // no-key users still get those snapshot rows), with any live OpenRouter
      // fetch folded on top. It is empty ONLY while the catalog is still
      // loading (cold start), when we fall back to the curated OpenRouter list
      // rather than flashing an empty provider.
      const live = openRouterModels(opts.catalog, opts.now);
      models.push(
        ...(live.length > 0
          ? live
          : curatedProviderModels(
              p,
              opts.statuses,
              offerIndex,
              opts.now,
              opts.describe,
            )),
      );
      continue;
    }
    models.push(
      ...curatedProviderModels(
        p,
        opts.statuses,
        offerIndex,
        opts.now,
        opts.describe,
      ),
    );
  }
  return models;
}

/**
 * Build the picker's provider list: every visible provider that owns ≥1 model
 * (`withModels`), each carrying its connection state. `providerPickerState`
 * already returns the `connected | checking | disconnected` vocabulary the
 * picker expects, including the #342 "checking" state while statuses load.
 */
export function buildPickerProviders(opts: {
  visibleProviders: readonly ProviderInfo[];
  statuses: Record<string, ProviderConnection | undefined>;
  isLoading: boolean;
  withModels: Set<string>;
}): ModelPickerProvider[] {
  return opts.visibleProviders
    .filter((p) => opts.withModels.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      connection: providerPickerState(opts.statuses[p.id], opts.isLoading),
    }));
}
