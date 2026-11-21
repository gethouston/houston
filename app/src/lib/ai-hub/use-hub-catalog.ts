import { useMemo } from "react";
import { useCapabilities } from "../../hooks/use-capabilities.ts";
import { useProviderCatalog } from "../../hooks/use-provider-catalog.ts";
import { newEngineActive } from "../engine.ts";
import { osIsTauri } from "../os-bridge.ts";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getVisibleProviders,
} from "../providers.ts";
import { loadHubCatalog } from "./catalog.ts";
import type { HubCatalog } from "./catalog-types.ts";

export type HubCatalogStatus = "loading" | "ready" | "offline";

export function useHubCatalog(): {
  catalog: HubCatalog | undefined;
  isLoading: boolean;
  status: HubCatalogStatus;
  offline: boolean;
} {
  const { catalog: piCatalog, isLoading, updatedAt } = useProviderCatalog();
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const desktop = osIsTauri();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `piCatalog` and the mutated-in-place PROVIDERS `getVisibleProviders` reads both advance in lockstep with `updatedAt`, which keys the memo.
  const catalog = useMemo(
    () =>
      piCatalog
        ? loadHubCatalog(piCatalog, {
            visibleProviderIds: new Set(
              getVisibleProviders({
                newEngine,
                desktop,
                capabilities: providerCapabilities,
              }).map((p) => p.id),
            ),
          })
        : undefined,
    [updatedAt, newEngine, desktop, providerCapabilities],
  );

  const status: HubCatalogStatus = isLoading ? "loading" : "ready";

  return { catalog, isLoading, status, offline: false };
}
