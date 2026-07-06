import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "../../hooks/use-capabilities.ts";
import { newEngineActive } from "../engine.ts";
import { osIsTauri } from "../os-bridge.ts";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getVisibleProviders,
} from "../providers.ts";
import { tauriProvider } from "../tauri.ts";
import { loadHubCatalog } from "./catalog.ts";
import { liveCatalogToRaw } from "./catalog-live.ts";
import type { RawModel } from "./catalog-snapshot.ts";
import type { HubCatalog } from "./catalog-types.ts";

/**
 * The catalog's live-data state, for the picker to reflect:
 * - `loading` — the query is in flight (no catalog yet).
 * - `ready` — the catalog is built (live OpenRouter merged in, or none was
 *   available: web/cloud, no key, or the provider isn't visible).
 * - `offline` — the live OpenRouter fetch THREW; the catalog degraded to the
 *   baked snapshot. The failure is already surfaced (toast + Sentry) by the
 *   engine-call wrapper; this flag lets the UI show a degraded-catalog hint.
 */
export type HubCatalogStatus = "loading" | "ready" | "offline";

interface LiveMerge {
  models: RawModel[];
  offline: boolean;
}

/**
 * Fetch + map the live OpenRouter catalog, degrading to snapshot-only (with an
 * `offline` flag) when the fetch throws. Only fetched when OpenRouter is visible
 * — otherwise its offers would be dropped by the merge's visibility gate anyway,
 * and the host answers `[]` when there's no key, so a fetch would be wasted.
 *
 * NOT a silent swallow: `tauriProvider.listModels` runs through the engine-call
 * wrapper, which has already shown the error toast and reported to Sentry before
 * it rethrows here. We catch only to keep the whole hook from erroring (the
 * snapshot still renders) and to raise the `offline` signal.
 */
async function fetchLiveOpenRouter(visibleIds: string[]): Promise<LiveMerge> {
  if (!visibleIds.includes("openrouter")) return { models: [], offline: false };
  try {
    const live = await tauriProvider.listModels("openrouter");
    return { models: liveCatalogToRaw(live), offline: false };
  } catch {
    return { models: [], offline: true };
  }
}

/**
 * The AI Hub catalog, scoped to the providers this deployment can connect to,
 * with the LIVE OpenRouter catalog folded into the baked snapshot.
 *
 * Resolves visible providers from host capabilities (same gating as the connect
 * surfaces via `getVisibleProviders`) so counts and offers stay honest on the
 * legacy engine and on the web, where API-key or local providers are hidden.
 * A change in the visible set (capabilities finishing their load) re-keys and
 * rebuilds. `status` tells the picker whether the live data merged, is still
 * loading, or degraded to snapshot-only (`offline`).
 */
export function useHubCatalog(): {
  catalog: HubCatalog | undefined;
  isLoading: boolean;
  status: HubCatalogStatus;
  offline: boolean;
} {
  const { capabilities, isLoading: capsLoading } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  const visibleIds = getVisibleProviders({
    newEngine,
    desktop: osIsTauri(),
    capabilities: providerCapabilities,
  }).map((p) => p.id);

  const query = useQuery({
    queryKey: ["ai-hub-catalog", [...visibleIds].sort()],
    queryFn: async () => {
      const live = await fetchLiveOpenRouter(visibleIds);
      const catalog = await loadHubCatalog(visibleIds, live.models);
      return { catalog, offline: live.offline };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const isLoading = capsLoading || query.isLoading;
  const offline = query.data?.offline ?? false;
  const status: HubCatalogStatus = isLoading
    ? "loading"
    : offline
      ? "offline"
      : "ready";

  return { catalog: query.data?.catalog, isLoading, status, offline };
}
