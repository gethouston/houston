import type { ProviderCatalog } from "@houston/protocol";
import { useQuery } from "@tanstack/react-query";
import { hydrateProviderCatalog } from "../lib/providers.ts";
import { tauriProvider } from "../lib/tauri.ts";

/**
 * The catalog object we last hydrated from. A module-level guard so hydration
 * runs exactly once per fetched catalog even though many components call the
 * hook and it re-runs on every render (and twice under StrictMode).
 */
let hydratedFrom: ProviderCatalog | null = null;

/**
 * Fetch the host's pi-ai provider catalog (`GET /v1/catalog`) once and hydrate
 * the module-level `PROVIDERS` cache with it, so the picker + connect surfaces
 * render the real runnable providers/models for this host (all ~35 on desktop,
 * ~3 on cloud) instead of the override-only seed.
 *
 * The catalog is static per host session (pi's baked registry — no network,
 * identical across a session), so it is cached with an infinite `staleTime`; a
 * host change is a fresh session. Hydration runs in an effect keyed on the query
 * result, mutating `PROVIDERS` in place so every existing `PROVIDERS` importer
 * sees the update at read time. A fetch failure is NOT swallowed: the `call()`
 * wrapper in `tauriProvider.getCatalog` has already toasted + reported it; the
 * query simply stays unhydrated (the seed keeps the UI working).
 *
 * Returns `{ isReady, updatedAt }` so later waves can depend on it for
 * reactivity — `updatedAt` changes whenever the cache is re-hydrated, so a
 * `PROVIDERS`-derived memo can re-key on it.
 */
export function useProviderCatalog(): {
  isReady: boolean;
  updatedAt: number;
} {
  const query = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: () => tauriProvider.getCatalog(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const catalog = query.data;
  // Hydrate SYNCHRONOUSLY during render (not in an effect): a consumer that
  // re-renders on `updatedAt` must read a freshly-populated `PROVIDERS` in the
  // SAME render — an effect runs only after that consumer already read the stale
  // cache, leaving it one render behind with no signal to correct. The ref guard
  // keeps it idempotent, so rebuilding only happens when the catalog changes.
  if (catalog && catalog !== hydratedFrom) {
    hydratedFrom = catalog;
    hydrateProviderCatalog(catalog);
  }

  return {
    isReady: query.isSuccess,
    updatedAt: query.dataUpdatedAt,
  };
}
