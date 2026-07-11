/**
 * Pure selectors for the model picker. No React, no DOM: this module decides
 * which providers and models are visible per level, while cmdk's built-in filter
 * owns in-list searching (the picker runs with the default `shouldFilter`). Kept
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
