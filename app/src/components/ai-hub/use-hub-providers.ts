import { useMemo } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import { searchProvidersWithOffers } from "../../lib/ai-hub/search-groups";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";
import {
  groupProviders,
  providerOwnedSide,
} from "../provider-browser/provider-grouping";

export interface HubProviders {
  owned: ProviderInfo[];
  connectedMatches: ProviderInfo[];
  availableMatches: ProviderInfo[];
  searching: boolean;
}

export function useHubProviders(
  connections: ProviderConnections,
  catalog: HubCatalog | null | undefined,
  query: string,
): HubProviders {
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  const connectProviders = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities],
  );
  const groups = useMemo(
    () => groupProviders(connectProviders, connections.connectionState),
    [connectProviders, connections.connectionState],
  );
  const available = groups.available;
  const owned = useMemo(() => providerOwnedSide(groups), [groups]);

  const searching = query.trim() !== "";
  const searchMatches = useMemo(
    () =>
      searchProvidersWithOffers(connectProviders, catalog?.models ?? [], query),
    [connectProviders, catalog, query],
  );
  const matchedProviderIds = useMemo(
    () => new Set(searchMatches.map((provider) => provider.id)),
    [searchMatches],
  );
  const connectedMatches = useMemo(
    () => owned.filter((provider) => matchedProviderIds.has(provider.id)),
    [owned, matchedProviderIds],
  );
  const availableMatches = useMemo(
    () => available.filter((provider) => matchedProviderIds.has(provider.id)),
    [available, matchedProviderIds],
  );

  return {
    owned,
    connectedMatches,
    availableMatches,
    searching,
  };
}
