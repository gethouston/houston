import type { CatalogModel, LabId } from "./catalog-types.ts";

/** Filters applied to the model directory. */
export interface ModelFilter {
  lab?: LabId;
  reasoning?: boolean;
  vision?: boolean;
}

/**
 * Search models by name, lab, or normalized key. Prefix matches on the name
 * rank first, then name substrings, then lab/key matches. Input order (the
 * catalog's newest-first sort) breaks ties, so it is preserved within a rank.
 * An empty query returns the list unchanged.
 */
export function searchModels(
  models: CatalogModel[],
  query: string,
): CatalogModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  const ranked: { model: CatalogModel; score: number; index: number }[] = [];
  models.forEach((model, index) => {
    const name = model.name.toLowerCase();
    let score: number;
    if (name.startsWith(q)) score = 0;
    else if (name.includes(q)) score = 1;
    else if (model.lab.includes(q) || model.key.includes(q)) score = 2;
    else return;
    ranked.push({ model, score, index });
  });
  ranked.sort((a, b) => a.score - b.score || a.index - b.index);
  return ranked.map((r) => r.model);
}

/** Narrow models to a lab and/or capability. Absent filters match everything. */
export function filterModels(
  models: CatalogModel[],
  filter: ModelFilter,
): CatalogModel[] {
  return models.filter((model) => {
    if (filter.lab && model.lab !== filter.lab) return false;
    if (filter.reasoning && !model.reasoning) return false;
    if (filter.vision && !model.inputModalities.includes("image")) return false;
    return true;
  });
}
