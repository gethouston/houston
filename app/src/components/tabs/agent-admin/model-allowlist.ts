/**
 * Pure selection helpers for the per-agent allowed-models ceiling, expressed
 * over the AI-hub catalog. The wire format is unchanged: `allowedModels` is a
 * flat set of provider-native model ids (`CatalogOffer.modelId`), where `null`
 * means every model is allowed. One `CatalogModel` is offered by one or more
 * providers, so a single visible row maps to SEVERAL ids — these helpers keep
 * the id set and the model rows in sync. DOM/i18n-free so they unit-test
 * (`app/tests/agent-admin-model-ceiling.test.ts`).
 */

import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";

/** A model is allowed when ANY of its provider offers is in the allowed set. */
export function modelChecked(
  model: CatalogModel,
  allowed: ReadonlySet<string>,
): boolean {
  return model.offers.some((offer) => allowed.has(offer.modelId));
}

/**
 * Flip a model in the allowed id set. When the model is currently allowed
 * (any offer present) every one of its offer ids is REMOVED; otherwise every
 * offer id is ADDED. Ids that belong to no offer of this model are left
 * untouched, so a stale/unknown id and other models' ids survive the toggle.
 * Returns a de-duplicated, stable-sorted array for deterministic writes.
 */
export function toggleModel(model: CatalogModel, allowed: string[]): string[] {
  const set = new Set(allowed);
  const checked = modelChecked(model, set);
  for (const offer of model.offers) {
    if (checked) set.delete(offer.modelId);
    else set.add(offer.modelId);
  }
  return sortedUnique(set);
}

/**
 * How many "models" an explicit ceiling restricts to, for the sidebar count and
 * the "{{count}} models only" copy. Counts each `CatalogModel` with at least one
 * allowed offer, PLUS every allowed id that matches no catalog offer (stale or
 * unknown ids). Unknown ids are surfaced rather than silently dropped so a
 * ceiling written against a model the local catalog no longer lists still reads
 * as a non-empty restriction.
 */
export function allowedModelCount(
  allowedIds: string[],
  models: readonly CatalogModel[],
): number {
  const allowed = new Set(allowedIds);
  const known = new Set<string>();
  for (const model of models) {
    for (const offer of model.offers) known.add(offer.modelId);
  }
  let unknown = 0;
  for (const id of allowed) {
    if (!known.has(id)) unknown++;
  }
  const matched = models.filter((model) => modelChecked(model, allowed)).length;
  return matched + unknown;
}

/**
 * Which variant of the "allowed models" list to render. The list is narrowed by
 * a view-only lab filter, so an empty *visible* list carries two very different
 * meanings: nothing has been picked at all (`"empty"`), or models are picked but
 * the active lab filter hides every one of them (`"empty-lab"`). Splitting the
 * two keeps the empty copy from falsely claiming nothing is picked when the user
 * simply filtered to a lab whose models they haven't allowed. `"empty-lab"` only
 * applies while a lab filter is active AND some model is picked overall.
 */
export type AllowedListView = "list" | "empty" | "empty-lab";

export function allowedListView(args: {
  /** How many picked models remain visible after the lab filter. */
  visibleCount: number;
  /** Whether any model is picked at all (before the lab filter). */
  hasPicked: boolean;
  /** Whether a specific lab (not "all labs") is currently selected. */
  labFiltered: boolean;
}): AllowedListView {
  if (args.visibleCount > 0) return "list";
  return args.labFiltered && args.hasPicked ? "empty-lab" : "empty";
}

/** A set as a de-duplicated, code-point-sorted array (fully deterministic). */
function sortedUnique(set: ReadonlySet<string>): string[] {
  return [...set].sort();
}
