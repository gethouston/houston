/**
 * Pure filtering / sorting / grouping for the model picker. No React, no DOM —
 * the component owns the list (cmdk runs with `shouldFilter={false}`), and this
 * module owns which rows show, in what order, and under which section. Kept
 * side-effect-free so it can be unit-tested directly.
 */

import type {
  ModelCapabilityKey,
  ModelPickerModel,
  ModelPickerSort,
  ModelPriceTier,
} from "./types";

export const CAPABILITY_ORDER: ModelCapabilityKey[] = [
  "vision",
  "reasoning",
  "tools",
  "imageGen",
];

export const PRICE_TIER_ORDER: ModelPriceTier[] = [
  "free",
  "low",
  "mid",
  "high",
];

export const SORT_ORDER: ModelPickerSort[] = [
  "relevance",
  "price",
  "context",
  "newest",
];

/** Selected rail entry: `"all"`, `"fav"`, or a concrete provider id. */
export interface ModelPickerFilterState {
  query: string;
  provider: string;
  favOnly: boolean;
  caps: ReadonlySet<ModelCapabilityKey>;
  priceTiers: ReadonlySet<ModelPriceTier>;
  sort: ModelPickerSort;
}

/** Whether the picker shows its grouped idle layout vs. a flat ranked list. */
export function isIdle(state: ModelPickerFilterState): boolean {
  return (
    state.provider === "all" &&
    state.query.trim() === "" &&
    state.caps.size === 0 &&
    state.priceTiers.size === 0 &&
    state.sort === "relevance" &&
    !state.favOnly
  );
}

/** Search haystack for a model: name, id, provider, description, capabilities. */
function haystack(model: ModelPickerModel, providerName: string): string {
  const caps = CAPABILITY_ORDER.filter((c) => model.capabilities[c]).join(" ");
  return `${model.name} ${model.id} ${model.providerId} ${providerName} ${
    model.description ?? ""
  } ${caps}`.toLowerCase();
}

function modelMatches(
  model: ModelPickerModel,
  providerName: string,
  favorites: ReadonlySet<string>,
  state: ModelPickerFilterState,
): boolean {
  if (state.provider === "fav" && !favorites.has(model.id)) return false;
  if (state.favOnly && !favorites.has(model.id)) return false;
  if (
    state.provider !== "all" &&
    state.provider !== "fav" &&
    model.providerId !== state.provider
  ) {
    return false;
  }
  for (const cap of state.caps) {
    if (!model.capabilities[cap]) return false;
  }
  if (state.priceTiers.size > 0) {
    if (!model.priceTier || !state.priceTiers.has(model.priceTier))
      return false;
  }
  const q = state.query.trim().toLowerCase();
  if (q && !haystack(model, providerName).includes(q)) return false;
  return true;
}

/** Character range of the query match in `name`, for `<HighlightedText>`. */
export function matchRange(
  name: string,
  query: string,
): { start: number; end: number } | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return undefined;
  return { start: i, end: i + q.length };
}

/** Sort a flat list per the chosen order (stable; original order breaks ties). */
export function sortModels(
  rows: ModelPickerModel[],
  sort: ModelPickerSort,
  favorites: ReadonlySet<string>,
): ModelPickerModel[] {
  const r = rows.slice();
  if (sort === "price") {
    return r.sort(
      (a, b) =>
        (a.priceInPerMtok ?? Number.POSITIVE_INFINITY) -
          (b.priceInPerMtok ?? Number.POSITIVE_INFINITY) ||
        (b.contextWindow ?? 0) - (a.contextWindow ?? 0),
    );
  }
  if (sort === "context") {
    return r.sort((a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0));
  }
  if (sort === "newest") {
    return r.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  }
  // relevance: favorites float to the top, otherwise input order.
  return r.sort(
    (a, b) => (favorites.has(b.id) ? 1 : 0) - (favorites.has(a.id) ? 1 : 0),
  );
}

/** Predicate re-export for `buildView` (kept together with the filter logic). */
export function filterMatched(
  models: ModelPickerModel[],
  providerNames: ReadonlyMap<string, string>,
  favorites: ReadonlySet<string>,
  state: ModelPickerFilterState,
): ModelPickerModel[] {
  return models.filter((m) =>
    modelMatches(m, providerNames.get(m.providerId) ?? "", favorites, state),
  );
}
