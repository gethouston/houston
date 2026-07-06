import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { tauriProvider } from "../tauri.ts";
import { loadHubCatalog } from "./catalog.ts";
import type { HubCatalog } from "./catalog-types.ts";

/**
 * The catalog's data state, for the picker to reflect:
 * - `loading` — the pi-ai catalog query is in flight (no catalog yet).
 * - `ready` — the catalog is built from the pi-ai catalog.
 * - `offline` — retained for the picker's `catalogState` mapping, but never
 *   reached: the pi-ai catalog is local (no network), so it can't degrade.
 */
export type HubCatalogStatus = "loading" | "ready" | "offline";

/**
 * The AI Hub catalog, DERIVED FROM the pi-ai catalog (the host's `GET /v1/catalog`
 * = the runnable set) enriched by the baked models.dev snapshot. Reads the SAME
 * `["provider-catalog"]` query the app hydrates `PROVIDERS` from (`useProviderCatalog`),
 * so there is no second fetch — react-query shares the cache entry. The hub
 * catalog is rebuilt whenever the query data changes (`dataUpdatedAt`).
 *
 * Because the source is local, only ONLY runnable models appear and `offline` is
 * always false; `status` is `loading` until the catalog resolves, then `ready`.
 * The `status`/`offline` fields are kept so the picker's `catalogState` mapping
 * still compiles.
 */
export function useHubCatalog(): {
  catalog: HubCatalog | undefined;
  isLoading: boolean;
  status: HubCatalogStatus;
  offline: boolean;
} {
  const query = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: () => tauriProvider.getCatalog(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Rebuild only when the fetched catalog changes (`dataUpdatedAt` bumps on every
  // cache write), keeping the hub reactive to a fresh pi-ai catalog.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on dataUpdatedAt, not the data ref.
  const catalog = useMemo(
    () => (query.data ? loadHubCatalog(query.data) : undefined),
    [query.dataUpdatedAt],
  );

  const isLoading = query.isLoading;
  const status: HubCatalogStatus = isLoading ? "loading" : "ready";

  return { catalog, isLoading, status, offline: false };
}
