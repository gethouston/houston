import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";

export function modelChecked(
  model: CatalogModel,
  allowed: ReadonlySet<string>,
): boolean {
  return model.offers.some((offer) => allowed.has(offer.modelId));
}

export function toggleModel(model: CatalogModel, allowed: string[]): string[] {
  const set = new Set(allowed);
  const checked = modelChecked(model, set);
  for (const offer of model.offers) {
    if (checked) set.delete(offer.modelId);
    else set.add(offer.modelId);
  }
  return sortedUnique(set);
}

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

export type AllowedListView = "list" | "empty" | "empty-lab";

export function allowedListView(args: {
  visibleCount: number;
  hasPicked: boolean;
  labFiltered: boolean;
}): AllowedListView {
  if (args.visibleCount > 0) return "list";
  return args.labFiltered && args.hasPicked ? "empty-lab" : "empty";
}

function sortedUnique(set: ReadonlySet<string>): string[] {
  return [...set].sort();
}
