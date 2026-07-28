import { useEffect } from "react";
import { defaultStoreCatalogQueryOptions } from "../components/store-view/store-browse";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { screenPrefetchPlan } from "../lib/screen-prefetch-plan";
import { tauriIntegrations, tauriOrg } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useCapabilities } from "./use-capabilities";

/** Warm screen-defining reads after the host and initial agent load settle. */
export function useScreenPrefetch() {
  const { capabilities } = useCapabilities();
  const agentsLoaded = useAgentStore((state) => state.loaded);

  useEffect(() => {
    if (!capabilities || !agentsLoaded) return;
    for (const item of screenPrefetchPlan(capabilities)) {
      if (item === "integrations") {
        void queryClient.prefetchQuery({
          queryKey: queryKeys.integrationStatus(),
          queryFn: () => tauriIntegrations.status(),
          staleTime: 30_000,
        });
        void queryClient.prefetchQuery({
          queryKey: queryKeys.integrationConnections("composio"),
          queryFn: () => tauriIntegrations.connections("composio"),
          staleTime: 30_000,
        });
        void queryClient.prefetchQuery({
          queryKey: queryKeys.integrationToolkits("composio"),
          queryFn: () => tauriIntegrations.toolkits("composio"),
          staleTime: 60 * 60_000,
        });
        void queryClient.prefetchQuery({
          queryKey: queryKeys.customIntegrations(),
          queryFn: () => tauriIntegrations.customList(),
          staleTime: 30_000,
        });
      }
      if (item === "organization") {
        void queryClient.prefetchQuery({
          queryKey: queryKeys.org(),
          queryFn: () => tauriOrg.get(),
          staleTime: 30_000,
        });
      }
      if (item === "store-catalog") {
        void queryClient.prefetchInfiniteQuery({
          ...defaultStoreCatalogQueryOptions(),
        });
      }
    }
  }, [agentsLoaded, capabilities]);
}
