import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCapabilities } from "../../hooks/use-capabilities.ts";
import { useProviderCatalog } from "../../hooks/use-provider-catalog.ts";
import { newEngineActive } from "../engine.ts";
import { osIsTauri } from "../os-bridge.ts";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getVisibleProviders,
} from "../providers.ts";
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

  // Hydrates `PROVIDERS` in place (shares the `["provider-catalog"]` query, no
  // second fetch); its `updatedAt` re-keys the memo so the visible set is read
  // AFTER hydration, not from the stale seed.
  const { updatedAt } = useProviderCatalog();
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const desktop = osIsTauri();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);

  // Rebuild only when the fetched catalog, the hydrated `PROVIDERS` set, or the
  // visibility inputs change. Scope the hub to the SAME providers the picker
  // shows (`getVisibleProviders`) so the AI Models tab and the picker never drift.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `getVisibleProviders` reads the mutated-in-place PROVIDERS, keyed by `updatedAt`.
  const catalog = useMemo(
    () =>
      query.data
        ? loadHubCatalog(query.data, {
            visibleProviderIds: new Set(
              getVisibleProviders({
                newEngine,
                desktop,
                capabilities: providerCapabilities,
              }).map((p) => p.id),
            ),
          })
        : undefined,
    [query.dataUpdatedAt, updatedAt, newEngine, desktop, providerCapabilities],
  );

  const isLoading = query.isLoading;
  const status: HubCatalogStatus = isLoading ? "loading" : "ready";

  return { catalog, isLoading, status, offline: false };
}
