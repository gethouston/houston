/**
 * Pure filtering / ordering for the AI Hub Providers tab: the free-text search,
 * the Subscription/Pay-as-you-go quick-filter narrowing, and the featured-first
 * pin. Applied ONLY inside the hub (`ProviderList`) — the chat model picker
 * maps `PROVIDERS` directly and never calls any of these, so its order and
 * behavior stay untouched. Kept component-free so it unit-tests with
 * `node --test` (`app/tests/provider-grouping.test.ts`).
 */

import { FEATURED_PROVIDER_IDS } from "../../lib/provider-overrides.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { providerBilling } from "./provider-grouping.ts";

/**
 * The Providers-tab quick filter: how a provider is BILLED, plus `all` (no
 * filter). A single-select toggle — clicking the active button returns to
 * `all` — not the exclusive-bucket kind: a card spanning both billing kinds
 * (the merged OpenCode account) matches whichever of `subscription`/`payg` is
 * active (`providerBilling`).
 */
export type ProviderQuickFilter = "all" | "subscription" | "payg";

export const PROVIDER_QUICK_FILTERS: readonly Exclude<
  ProviderQuickFilter,
  "all"
>[] = ["subscription", "payg"];

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
 * Narrow a provider list to just the "most popular" set — the ones pinned in
 * `FEATURED_PROVIDER_IDS` — returned in that pinned order (reusing
 * `orderFeaturedFirst` so the front order is defined once). Used by the curated
 * onboarding view for its collapsed default, before the user hits "see all".
 * Tolerant of a featured id being absent from `providers` (e.g. the
 * capability-gated local provider) — it is simply not included.
 */
export function filterToFeatured(
  providers: readonly ProviderInfo[],
): ProviderInfo[] {
  const featured = new Set<string>(FEATURED_PROVIDER_IDS);
  return orderFeaturedFirst(providers).filter((p) => featured.has(p.id));
}

/**
 * The provider set the curated onboarding view actually RENDERS, plus whether a
 * "see all providers" chip is still warranted. Collapsed (the default) it shows
 * only the featured subset; an ACTIVE search or quick-filter, or the "see all"
 * expansion, reveals the full `filtered` set instead. Searching / filtering is
 * explicit "find this specific provider" intent, so it must bypass the featured
 * narrowing — otherwise a non-featured match (e.g. DeepSeek) would filter to a
 * non-empty `filtered` yet render nothing, leaving only a dangling chip. The chip
 * shows ONLY while collapsed AND providers remain hidden (never while searching).
 * In the uncurated hub every provider always shows and there is never a chip.
 * Pure, so it unit-tests with `node --test`.
 */
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
 * Narrow providers to one quick-filter facet; `all` passes everything through
 * unchanged. Preserves incoming order.
 */
export function filterByQuickFilter(
  providers: readonly ProviderInfo[],
  filter: ProviderQuickFilter,
): ProviderInfo[] {
  if (filter === "all") return [...providers];
  return providers.filter((p) => providerBilling(p).has(filter));
}
