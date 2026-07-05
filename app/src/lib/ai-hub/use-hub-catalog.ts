import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "../../hooks/use-capabilities.ts";
import { newEngineActive } from "../engine.ts";
import { osIsTauri } from "../os-bridge.ts";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getVisibleProviders,
} from "../providers.ts";
import { loadHubCatalog } from "./catalog.ts";
import type { HubCatalog } from "./catalog-types.ts";

/**
 * The AI Hub catalog, scoped to the providers this deployment can connect to.
 *
 * Resolves visible providers from host capabilities (same gating as the connect
 * surfaces via `getVisibleProviders`) so counts and offers stay honest on the
 * legacy engine and on the web, where API-key or local providers are hidden.
 * The snapshot is static, so the query never goes stale; a change in the
 * visible set (capabilities finishing their load) re-keys and rebuilds.
 */
export function useHubCatalog(): {
  catalog: HubCatalog | undefined;
  isLoading: boolean;
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
    queryFn: () => loadHubCatalog(visibleIds),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return { catalog: query.data, isLoading: capsLoading || query.isLoading };
}
