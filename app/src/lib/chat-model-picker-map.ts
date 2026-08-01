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
 * PER-USER AI ACCOUNTS (HOU-976 §6): there is deliberately NO extra filtering
 * here. `configured` / `auth_state` on a status row is already resolved for the
 * ACTING identity by the pod that answered `GET /providers`, so "connected"
 * means "connected for whoever is asking" and the existing connection filter IS
 * the intersect. We do not model per-plan model entitlements client-side either:
 * a personal plan that lacks a model must fail the turn honestly as
 * `ModelUnavailable` rather than have the row quietly disappear. All this layer
 * adds is the account LABEL on each row (`accountLabelOf`).
 *
 * Ranking: with the sort menu gone, the pi catalog's raw order (often
 * oldest-first) would bury the flagships, so each provider's rows are re-ranked
 * CURATED-FIRST — the models with a `PROVIDER_OVERRIDES` entry lead, in their
 * override (curation) order, then the remaining catalog models in catalog order.
 * The picker renders rows in this input order, so pass them pre-ranked.
 */

import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import { encodeModelPickerId } from "./chat-model-picker-ids.ts";
import { pickerModelRows, withAccountLabel } from "./model-picker.ts";
import {
  type ProviderConnectionStatus,
  providerConnectionState,
} from "./provider-connection.ts";
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
  accountLabelOf: ((providerId: string) => string | undefined) | undefined,
): ModelPickerModel[] {
  const rows = pickerModelRows(
    p.models,
    statuses[p.id]?.active_model,
    p.subtitle,
  );
  // The account label is appended AFTER localization, so it qualifies the
  // translated description rather than the catalog English it fell back to.
  const accountLabel = accountLabelOf?.(p.id);
  return rankCuratedFirst(rows, curatedModelIds(p.id)).map((row) => ({
    id: encodeModelPickerId(p.id, row.id),
    providerId: p.id,
    name: row.label,
    description: withAccountLabel(
      describe ? describe(p.id, row.id, row.description) : row.description,
      accountLabel,
    ),
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
  /**
   * The already-translated name of the ACCOUNT a provider's models run on
   * ("your account" / "team account", HOU-976 §6), or undefined for a provider
   * whose deployment never said. Injected as data exactly like `describe`, so
   * this module stays i18n-free.
   */
  accountLabelOf?: (providerId: string) => string | undefined;
}): ModelPickerModel[] {
  const models: ModelPickerModel[] = [];
  for (const p of opts.visibleProviders) {
    models.push(
      ...providerModelRows(
        p,
        opts.statuses,
        opts.describe,
        opts.accountLabelOf,
      ),
    );
  }
  return models;
}

/**
 * Build the picker's provider list: every visible provider that owns ≥1 model
 * (`withModels`), each carrying its connection state. The shared
 * `providerConnectionState` (the ONE derivation, HOU-979) already returns the
 * `connected | checking | disconnected` vocabulary the picker expects,
 * including the neutral "checking" state while statuses load or come back
 * `unknown`.
 */
export function buildPickerProviders(opts: {
  visibleProviders: readonly ProviderInfo[];
  statuses: Record<string, ProviderConnectionStatus | undefined>;
  isLoading: boolean;
  withModels: Set<string>;
}): ModelPickerProvider[] {
  return opts.visibleProviders
    .filter((p) => opts.withModels.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      connection: providerConnectionState(opts.statuses[p.id], opts.isLoading),
    }));
}
