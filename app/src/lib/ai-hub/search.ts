import type { CatalogModel, LabId } from "./catalog-types.ts";

export interface ModelFilter {
  lab?: LabId;
  reasoning?: boolean;
  vision?: boolean;
}

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
