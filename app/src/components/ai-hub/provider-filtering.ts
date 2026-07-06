/**
 * Pure filtering / ordering for the AI Hub Providers tab: the free-text search,
 * the category narrowing, and the featured-first pin. Applied ONLY inside the
 * hub (`ProviderList`) — the chat model picker maps `PROVIDERS` directly and
 * never calls any of these, so its order and behavior stay untouched. Kept
 * component-free so it unit-tests with `node --test`
 * (`app/tests/provider-grouping.test.ts`).
 */

import {
  FEATURED_PROVIDER_IDS,
  type ProviderCategory,
  providerCategory,
} from "../../lib/provider-overrides.ts";
import type { ProviderInfo } from "../../lib/providers.ts";

/** The Providers-tab category filter: a real category, or `all` for every one. */
export type ProviderCategoryFilter = ProviderCategory | "all";

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

/** Narrow providers to one category; `all` passes everything through unchanged. */
export function filterByCategory(
  providers: readonly ProviderInfo[],
  category: ProviderCategoryFilter,
): ProviderInfo[] {
  if (category === "all") return [...providers];
  return providers.filter((p) => providerCategory(p.id) === category);
}
