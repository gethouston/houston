import type { ProviderCatalog } from "@houston/protocol";
import { useQuery } from "@tanstack/react-query";
import { getEngine, newEngineActive } from "../lib/engine";
import i18n from "../lib/i18n";
import { hydrateProviderCatalog } from "../lib/providers.ts";
import { deriveCatalogFailure } from "./query-error-toast-state.ts";
import { useQueryErrorToast } from "./use-query-error-toast.ts";

/**
 * The catalog object we last hydrated from. A module-level guard so hydration
 * runs exactly once per fetched catalog even though many components call the
 * hook and it re-runs on every render (and twice under StrictMode).
 */
let hydratedFrom: ProviderCatalog | null = null;

/**
 * Fetch the host's pi-ai provider catalog (`GET /v1/catalog`) once and hydrate
 * the module-level `PROVIDERS` cache with it, so the picker + connect surfaces
 * render the real runnable providers/models (the full pi-ai set, ~35, on every
 * deployment — desktop and hosted alike) instead of the override-only seed.
 *
 * The catalog is static per host session (pi's baked registry — no network,
 * identical across a session), so it is cached with an infinite `staleTime`; a
 * host change is a fresh session. Hydration runs synchronously during render
 * keyed on the query result, mutating `PROVIDERS` in place so every existing
 * `PROVIDERS` importer sees the update at read time.
 *
 * The fetch calls the host client DIRECTLY (`getEngine().getCatalog()`), not the
 * toasting `call()` wrapper: this hook is the SOLE owner of the query and renders
 * its OWN, user-friendly failure toast (below), so routing through `call()` would
 * fire a second, raw "engine error 404" toast on top of it. This mirrors
 * `useCapabilities`, which self-toasts for the same reason. A failure is NEVER
 * swallowed — the user sees a toast (no-silent-failures policy) while the seed
 * keeps the UI working.
 *
 * Returns `{ isReady, updatedAt, catalog, isLoading }`. `updatedAt` changes
 * whenever the cache is re-hydrated, so a `PROVIDERS`-derived memo can re-key on
 * it; `catalog`/`isLoading` let the AI Hub derive its view from THIS query
 * instead of registering a second observer of `["provider-catalog"]` with a
 * divergent queryFn (which made a catalog failure toast twice, last-observer-wins).
 */
export function useProviderCatalog(): {
  isReady: boolean;
  updatedAt: number;
  catalog: ProviderCatalog | undefined;
  isLoading: boolean;
} {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: ["provider-catalog"],
    // `getCatalog` is a new-engine-adapter method absent from the shared
    // engine-client type, so cast.
    queryFn: (): Promise<ProviderCatalog> =>
      (
        getEngine() as unknown as {
          getCatalog: () => Promise<ProviderCatalog>;
        }
      ).getCatalog(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 3,
  });

  // Surface a failed catalog load: the picker + AI Models tab fall back to the
  // seed (all providers, ZERO models), which looks like a working-but-empty
  // catalog — so the user MUST see that the model list failed to load. This
  // counts a network/HTTP error AND a 200-but-empty payload as failures (a
  // healthy host never returns []), both firing the same toast once per
  // occurrence via the shared dedupe hook.
  const { isFailure, identity } = deriveCatalogFailure({
    isError: query.isError,
    error: query.error,
    isSuccess: query.isSuccess,
    count: query.data?.length ?? 0,
  });
  useQueryErrorToast(
    isFailure,
    identity,
    "provider_catalog",
    i18n.t("providers:toast.catalogLoadFailed"),
  );

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
    catalog,
    isLoading: query.isLoading,
  };
}
