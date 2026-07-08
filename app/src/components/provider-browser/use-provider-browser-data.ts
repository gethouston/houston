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

/** The three inputs `<ProviderBrowser>` needs, resolved from live hooks. */
export interface ProviderBrowserData {
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog | undefined;
}

/**
 * Wires up everything `<ProviderBrowser>` consumes so the connect-focused
 * surfaces (onboarding, migration reconnect, workspace setup) mount the SAME
 * marketplace the AI Hub shows with one call. Builds the pre-gated connect list
 * (`getConnectProviders`, engine + capability gated), the connection machinery
 * (`useProviderConnections`), and the enriched model catalog (`useHubCatalog`).
 *
 * The pi-ai catalog hydrates `PROVIDERS` IN PLACE with no React signal, so the
 * `getConnectProviders` memo re-keys on `useProviderCatalog().updatedAt` —
 * without it the list stays pinned to the override-only seed captured on first
 * render, the moment `/v1/catalog` resolves after mount. Same reactivity the
 * hub catalog and model picker use.
 */
export function useProviderBrowserData(): ProviderBrowserData {
  const connections = useProviderConnections();
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
