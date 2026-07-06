/**
 * Pure mapping from Houston's provider/model catalog into the generic
 * `ModelPickerModel` / `ModelPickerProvider` view-models the `@houston-ai/core`
 * `ModelPicker` renders. Split out from `ChatModelSelector` so the (non-trivial)
 * row-building logic is unit-testable without a React renderer and the container
 * stays under the file-size budget.
 *
 * The one hard invariant: the picker must only ever offer RUNNABLE
 * (provider, model) pairs, so it NEVER drives providers blindly from the hub
 * catalog. Every provider — OpenRouter's full set included — enumerates its own
 * `PROVIDERS[].models`, which is now the DYNAMIC runnable set hydrated from the
 * host's pi-ai catalog (`useProviderCatalog`), not a hand-curated seed. Those
 * rows (plus the synthesized dynamic row for the local `openai-compatible`
 * provider) are enriched from the Wave-2 hub catalog when a matching offer is
 * found by exact `${providerId}::${modelId}` id. There is no per-provider special
 * case: one uniform path builds them all.
 */

import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import type { HubCatalog } from "./ai-hub/catalog-types.ts";
import {
  buildOfferIndex,
  enrich,
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

/** The engine-reported runtime model for a catalog-less (local) provider. */
type StatusModel = { active_model?: string };

/**
 * A single provider's hydrated `PROVIDERS[].models` as runnable picker rows
 * (including the synthesized dynamic row for the local `openai-compatible`
 * provider), each enriched from the hub catalog when a matching offer exists.
 * This is the ONLY path — used identically for every visible provider.
 */
function providerModelRows(
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
 * Build the picker's full model list. Every visible provider enumerates its
 * hydrated rows (via `pickerModelRows`, so the local provider's dynamic row is
 * included) and enriches from the hub catalog when a matching offer exists.
 * `describe` localizes a row's description (falling back to the catalog English),
 * mirroring the old dropdown's `modelDescriptions` lookup.
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
    models.push(
      ...providerModelRows(
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
