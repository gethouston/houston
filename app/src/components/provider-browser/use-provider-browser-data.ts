import { useMemo } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderCatalog } from "../../hooks/use-provider-catalog";
import {
  type ProviderConnections,
  useProviderConnections,
} from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";

export interface ProviderBrowserData {
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog | undefined;
}

export function useProviderBrowserData(): ProviderBrowserData {
  const connections = useProviderConnections({ alwaysActive: true });
  const { catalog } = useHubCatalog();
  const { capabilities } = useCapabilities();
  const { updatedAt } = useProviderCatalog();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: updatedAt keys the in-place PROVIDERS hydration.
  const providers = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities, updatedAt],
  );

  return { providers, connections, catalog };
}
