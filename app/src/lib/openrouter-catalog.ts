import type { OpenRouterCatalogModel } from "@houston-ai/engine-client";
import {
  OPENROUTER_FREE_RECOMMENDED_MODEL_IDS,
  openRouterDistinctPaidRecommendedModelIds,
} from "./openrouter-models.ts";

/** OpenRouter catalog changes slowly; match Composio browse-apps stale window. */
export const OPENROUTER_CATALOG_STALE_MS = 60 * 60 * 1000;

export function filterOpenRouterCatalog(
  models: readonly OpenRouterCatalogModel[],
  query: string,
): OpenRouterCatalogModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...models];
  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q),
  );
}

export function mergeOpenRouterSlugSelection(
  current: readonly string[],
  add: readonly string[],
): string[] {
  const seen = new Set(current);
  const out = [...current];
  for (const slug of add) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function resolveRecommendedSlugs(
  catalog: readonly OpenRouterCatalogModel[],
  kind: "free" | "paid",
): string[] {
  const catalogIds = new Set(catalog.map((m) => m.id));
  const wanted =
    kind === "free"
      ? OPENROUTER_FREE_RECOMMENDED_MODEL_IDS
      : openRouterDistinctPaidRecommendedModelIds();
  return wanted.filter((id) => catalogIds.has(id));
}
