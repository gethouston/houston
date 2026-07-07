/**
 * Pure mapping from Houston's provider/model catalog into the generic
 * `ModelPickerModel` / `ModelPickerProvider` view-models the `@houston-ai/core`
 * `ModelPicker` renders. Split out from `ChatModelSelector` so the row-building
 * logic is unit-testable without a React renderer and the container stays under
 * the file-size budget.
 *
 * The one hard invariant: the picker must only ever offer RUNNABLE
 * (provider, model) pairs, so it NEVER drives providers blindly from the hub
 * catalog. Every provider — OpenRouter's full set included — enumerates its own
 * `PROVIDERS[].models`, which is the DYNAMIC runnable set hydrated from the
 * host's pi-ai catalog (`useProviderCatalog`), not a hand-curated seed (plus the
 * synthesized dynamic row for the local `openai-compatible` provider). There is
 * no per-provider special case: one uniform path builds them all.
 *
 * The picker renders only name + description, so a row carries only those:
 * capability / price / context enrichment was dropped with the model detail
 * panel it used to feed.
 *
 * Ranking: with the sort menu gone, the pi catalog's raw order (often
 * oldest-first) would bury the flagships, so each provider's rows are re-ranked
 * CURATED-FIRST — the models with a `PROVIDER_OVERRIDES` entry lead, in their
 * override (curation) order, then the remaining catalog models in catalog order.
 * Curated rows are flagged (`curated: true`) so the picker's search can apply
 * the same bias as a tiebreaker on match quality.
 */

import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import { encodeModelPickerId } from "./chat-model-picker-ids.ts";
import {
  type ProviderConnection,
  pickerModelRows,
  providerPickerState,
} from "./model-picker.ts";
import { PROVIDER_OVERRIDES } from "./provider-overrides.ts";
import type { ProviderInfo } from "./providers.ts";

/** The engine-reported runtime model for a catalog-less (local) provider. */
type StatusModel = { active_model?: string };

/**
 * Rank a provider's rows curated-first: rows whose id appears in `curatedIds`
 * lead, in `curatedIds` order; the rest follow in their original (catalog)
 * order. Pure so the ranking is unit-testable with any id set.
 */
export function rankCuratedFirst<T extends { id: string }>(
  rows: readonly T[],
  curatedIds: readonly string[],
): T[] {
  if (curatedIds.length === 0) return [...rows];
  const rank = new Map(curatedIds.map((id, i) => [id, i]));
  return rows
    .map((row, order) => ({ row, order, curated: rank.get(row.id) }))
    .sort(
      (a, b) =>
        (a.curated ?? Number.MAX_SAFE_INTEGER) -
          (b.curated ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
    )
    .map((e) => e.row);
}

/** A provider's curated model ids, in curation (override key) order. */
function curatedModelIds(providerId: string): string[] {
  return Object.keys(PROVIDER_OVERRIDES[providerId]?.models ?? {});
}

/**
 * A single provider's hydrated `PROVIDERS[].models` as runnable picker rows
 * (including the synthesized dynamic row for the local `openai-compatible`
 * provider), ranked curated-first. This is the ONLY path — used identically for
 * every visible provider.
 */
function providerModelRows(
  p: ProviderInfo,
  statuses: Record<string, StatusModel | undefined>,
  describe:
    | ((providerId: string, modelId: string, fallback: string) => string)
    | undefined,
): ModelPickerModel[] {
  const curatedIds = curatedModelIds(p.id);
  const curated = new Set(curatedIds);
  const rows = pickerModelRows(
    p.models,
    statuses[p.id]?.active_model,
    p.subtitle,
  );
  return rankCuratedFirst(rows, curatedIds).map((row) => ({
    id: encodeModelPickerId(p.id, row.id),
    providerId: p.id,
    name: row.label,
    description: describe
      ? describe(p.id, row.id, row.description)
      : row.description,
    // Omitted (not `undefined`) on uncurated rows, keeping the row shape exact.
    ...(curated.has(row.id) ? { curated: true } : {}),
  }));
}

/**
 * Build the picker's full model list. Every visible provider enumerates its
 * hydrated rows (via `pickerModelRows`, so the local provider's dynamic row is
 * included). `describe` localizes a row's description (falling back to the
 * catalog English), mirroring the old dropdown's `modelDescriptions` lookup.
 */
export function buildPickerModels(opts: {
  visibleProviders: readonly ProviderInfo[];
  statuses: Record<string, StatusModel | undefined>;
  describe?: (providerId: string, modelId: string, fallback: string) => string;
}): ModelPickerModel[] {
  const models: ModelPickerModel[] = [];
  for (const p of opts.visibleProviders) {
    models.push(...providerModelRows(p, opts.statuses, opts.describe));
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
