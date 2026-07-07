import type { ActingContext } from "./provider";
import type { IntegrationRegistry } from "./registry";
import type { ConnectedAccountInfo, SearchResult, ToolMatch } from "./types";

/** One provider's search result, tagged with the id that produced it. */
export interface ProviderSearch {
  id: string;
  result: SearchResult;
}

/**
 * Fan a search out over EVERY wired provider in parallel. A single provider
 * error rejects the whole call (Promise.all) — no silent partial results: the
 * agent must see either a complete picture or a surfaced failure, never a
 * quietly-shrunken one.
 */
export async function searchAllProviders(
  registry: IntegrationRegistry,
  userId: string,
  query: string,
  acting: ActingContext | undefined,
): Promise<ProviderSearch[]> {
  const ids = registry.ids();
  const results = await Promise.all(
    ids.map((id) => registry.get(id).search(userId, query, acting)),
  );
  return ids.map((id, i) => ({ id, result: results[i] as SearchResult }));
}

/**
 * Merge each provider's matches, stamping every match with the provider that
 * surfaced it so a later execute routes back to the right one. The stamp is
 * authoritative — it overwrites any `provider` a raw adapter may have set.
 */
export function mergeSearchItems(searches: ProviderSearch[]): ToolMatch[] {
  return searches.flatMap((s) =>
    s.result.items.map((item) => ({ ...item, provider: s.id })),
  );
}

/**
 * Merge the provider-attached accounts (present on gateway-fronted pods, where
 * each provider's upstream already resolved the acting agent's granted
 * accounts). Absent everywhere → an empty list.
 */
export function mergeSearchAccounts(
  searches: ProviderSearch[],
): ConnectedAccountInfo[] {
  return searches.flatMap((s) => s.result.accounts ?? []);
}
