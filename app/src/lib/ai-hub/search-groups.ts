import { type ProviderInfo, providerGatewayIds } from "../providers.ts";
import type { CatalogModel } from "./catalog-types.ts";
import { searchModels } from "./search.ts";

/** Provider name/id/subtitle matching shared by provider-only and grouped search. */
export function searchProviderNames(
  providers: readonly ProviderInfo[],
  query: string,
): ProviderInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...providers];
  return providers.filter(
    (provider) =>
      provider.name.toLowerCase().includes(q) ||
      provider.id.toLowerCase().includes(q) ||
      provider.subtitle.toLowerCase().includes(q),
  );
}

/**
 * Search providers directly or through any matching model offer.
 */
export function searchProvidersWithOffers(
  providers: readonly ProviderInfo[],
  models: CatalogModel[],
  query: string,
): ProviderInfo[] {
  if (!query.trim()) return [...providers];

  const matchedModels = searchModels(models, query);
  const offeredBy = new Set(
    matchedModels.flatMap((model) =>
      model.offers.map((offer) => offer.providerId),
    ),
  );
  const directMatches = new Set(
    searchProviderNames(providers, query).map((provider) => provider.id),
  );

  return providers.filter(
    (provider) =>
      directMatches.has(provider.id) ||
      providerGatewayIds(provider).some((id) => offeredBy.has(id)),
  );
}
