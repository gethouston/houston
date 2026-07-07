/**
 * Pure filtering / ordering for the AI Hub Providers tab: the free-text search,
 * the plain-language quick-filter narrowing, and the featured-first pin. Applied
 * ONLY inside the hub (`ProviderList`) — the chat model picker maps `PROVIDERS`
 * directly and never calls any of these, so its order and behavior stay
 * untouched. Kept component-free so it unit-tests with `node --test`
 * (`app/tests/provider-grouping.test.ts`).
 */

import {
  FEATURED_PROVIDER_IDS,
  PROVIDER_OVERRIDES,
} from "../../lib/provider-overrides.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { authChipKey } from "./provider-grouping.ts";

/**
 * The Providers-tab quick filter: plain-language facets a non-technical user
 * understands, plus `all`. These are OVERLAPPING facets, not exclusive buckets —
 * a provider can match several at once (e.g. Google is both `popular` and
 * `free`, a local model is both `free` and `local`).
 */
export type ProviderQuickFilter =
  | "all"
  | "popular"
  | "subscription"
  | "free"
  | "payg"
  | "local";

export const PROVIDER_QUICK_FILTERS: readonly ProviderQuickFilter[] = [
  "all",
  "popular",
  "subscription",
  "free",
  "payg",
  "local",
];

/**
 * Pin the featured providers to the front in `FEATURED_PROVIDER_IDS` order; the
 * rest keep their incoming (catalog) order. Stable and tolerant of missing ids
 * (a featured id absent from `providers` — e.g. the capability-gated local
 * provider — is simply skipped). Reorders ONLY the hub's Providers tab; the chat
 * picker maps `PROVIDERS` directly and never calls this.
 */
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

/**
 * Case-insensitive provider search over name, id, and subtitle. An empty (or
 * whitespace) query returns every provider. Preserves incoming order.
 */
export function searchProviders(
  providers: readonly ProviderInfo[],
  query: string,
): ProviderInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...providers];
  return providers.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.subtitle.toLowerCase().includes(q),
  );
}

/**
 * Whether a provider matches one plain-language quick-filter facet. The facets
 * OVERLAP (a provider may satisfy several) — this answers each independently:
 *   popular      → pinned in FEATURED_PROVIDER_IDS
 *   subscription → connects via an OAuth / plan (auth chip "subscription")
 *   free         → has a curated free tier, OR is a local model (costs nothing)
 *   payg         → pay-as-you-go: a pasted key or a multi-lab gateway
 *   local        → runs on the user's own computer
 */
function matchesQuickFilter(
  provider: ProviderInfo,
  filter: ProviderQuickFilter,
): boolean {
  const chip = authChipKey(provider);
  switch (filter) {
    case "all":
      return true;
    case "popular":
      return FEATURED_PROVIDER_IDS.includes(
        provider.id as (typeof FEATURED_PROVIDER_IDS)[number],
      );
    case "subscription":
      return chip === "subscription";
    case "free":
      return (
        PROVIDER_OVERRIDES[provider.id]?.freeTier === true || chip === "local"
      );
    case "payg":
      return chip === "apiKey" || chip === "gateway";
    case "local":
      return chip === "local";
  }
}

/**
 * Narrow providers to one quick-filter facet; `all` passes everything through
 * unchanged. Facets overlap, so this is a plain per-provider membership test,
 * not a partition. Preserves incoming order.
 */
export function filterByQuickFilter(
  providers: readonly ProviderInfo[],
  filter: ProviderQuickFilter,
): ProviderInfo[] {
  if (filter === "all") return [...providers];
  return providers.filter((p) => matchesQuickFilter(p, filter));
}
