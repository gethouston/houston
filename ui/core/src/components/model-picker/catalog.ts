/**
 * Pure selectors for the model picker. No React, no DOM: the component owns the
 * list (cmdk runs with `shouldFilter={false}`), and this module decides which
 * providers and models are visible and, when searching, in what order. Kept
 * side-effect-free so it can be unit-tested directly.
 *
 * The one hard rule everything here enforces: only CONNECTED providers and their
 * models are ever visible. Disconnected providers simply do not appear — the only
 * path to them is the picker's "Connect more providers…" footer.
 */

import type {
  ModelPickerCatalogState,
  ModelPickerModel,
  ModelPickerProvider,
} from "./types";

/** The connected providers, in input order. */
export function connectedProviders(
  providers: readonly ModelPickerProvider[],
): ModelPickerProvider[] {
  return providers.filter((p) => p.connection === "connected");
}

/** Ids of the connected providers, for cheap membership checks. */
export function connectedProviderIds(
  providers: readonly ModelPickerProvider[],
): Set<string> {
  const ids = new Set<string>();
  for (const p of providers) if (p.connection === "connected") ids.add(p.id);
  return ids;
}

/**
 * Whether the level-1 list should show a neutral loading state rather than an
 * empty "no providers" one. Regression guard for issue #342: while statuses (or
 * the catalog) are still resolving we must never flash "no providers". Once any
 * provider is connected there is real content, so loading is over.
 */
export function providerListLoading(
  providers: readonly ModelPickerProvider[],
  catalogState: ModelPickerCatalogState,
): boolean {
  if (providers.some((p) => p.connection === "connected")) return false;
  return (
    catalogState === "loading" ||
    providers.some((p) => p.connection === "checking")
  );
}

/** Search haystack for a model: name, id, provider id + name, description. */
function haystack(model: ModelPickerModel, providerName: string): string {
  return `${model.name} ${model.id} ${model.providerId} ${providerName} ${
    model.description ?? ""
  }`.toLowerCase();
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

/**
 * The models to show at level 2 for a provider: that provider's rows in input
 * order, but only when the provider is actually connected (a stale/disconnected
 * id yields nothing).
 */
export function modelsForProvider(
  models: readonly ModelPickerModel[],
  connectedIds: ReadonlySet<string>,
  providerId: string,
): ModelPickerModel[] {
  if (!connectedIds.has(providerId)) return [];
  return models.filter((m) => m.providerId === providerId);
}

/**
 * Flat, ranked search across ALL connected providers. Ranking, in order:
 * 1. match tier — a name match beats a match that only hits other fields;
 * 2. curation — within a tier, a `curated` (flagship) model beats an uncurated
 *    one, so legacy catalog entries never bury the flagships;
 * 3. position of the match in the name (earlier wins);
 * 4. input order (which the caller passes pre-ranked curated-first).
 * Models from disconnected providers are excluded entirely.
 */
export function searchModels(
  models: readonly ModelPickerModel[],
  providers: readonly ModelPickerProvider[],
  query: string,
): ModelPickerModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const connected = connectedProviderIds(providers);
  const names = new Map(providers.map((p) => [p.id, p.name]));
  const hits: {
    model: ModelPickerModel;
    tier: number;
    curated: number;
    pos: number;
    order: number;
  }[] = [];
  models.forEach((model, order) => {
    if (!connected.has(model.providerId)) return;
    const nameIdx = model.name.toLowerCase().indexOf(q);
    const inName = nameIdx >= 0;
    if (
      !inName &&
      !haystack(model, names.get(model.providerId) ?? "").includes(q)
    )
      return;
    hits.push({
      model,
      tier: inName ? 0 : 1,
      curated: model.curated ? 0 : 1,
      pos: inName ? nameIdx : 0,
      order,
    });
  });
  hits.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.curated - b.curated ||
      a.pos - b.pos ||
      a.order - b.order,
  );
  return hits.map((h) => h.model);
}
