import { searchProviderNames } from "../../lib/ai-hub/search-groups.ts";
import { FEATURED_PROVIDER_IDS } from "../../lib/provider-overrides.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { providerBilling } from "./provider-grouping.ts";

export type ProviderQuickFilter = "all" | "subscription" | "payg";

export const PROVIDER_QUICK_FILTERS: readonly Exclude<
  ProviderQuickFilter,
  "all"
>[] = ["subscription", "payg"];

export function orderFeaturedFirst(
  providers: readonly ProviderInfo[],
): ProviderInfo[] {
  const rank = new Map<string, number>(
    FEATURED_PROVIDER_IDS.map((id, i) => [id, i]),
  );
  const featured: ProviderInfo[] = [];
  const rest: ProviderInfo[] = [];
  for (const p of providers) (rank.has(p.id) ? featured : rest).push(p);
  featured.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...featured, ...rest];
}

export function filterToFeatured(
  providers: readonly ProviderInfo[],
): ProviderInfo[] {
  const featured = new Set<string>(FEATURED_PROVIDER_IDS);
  return orderFeaturedFirst(providers).filter((p) => featured.has(p.id));
}

export function curatedDisplay(
  filtered: readonly ProviderInfo[],
  curated: boolean,
  expanded: boolean,
  searching: boolean,
): { displayed: ProviderInfo[]; hasMore: boolean } {
  if (!curated || expanded || searching)
    return { displayed: [...filtered], hasMore: false };
  const featured = filterToFeatured(filtered);
  return { displayed: featured, hasMore: filtered.length > featured.length };
}

export function searchProviders(
  providers: readonly ProviderInfo[],
  query: string,
): ProviderInfo[] {
  return searchProviderNames(providers, query);
}

export function filterByQuickFilter(
  providers: readonly ProviderInfo[],
  filter: ProviderQuickFilter,
): ProviderInfo[] {
  if (filter === "all") return [...providers];
  return providers.filter((p) => providerBilling(p).has(filter));
}
