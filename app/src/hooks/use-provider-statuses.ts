import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { newEngineActive } from "../lib/engine";
import { osIsTauri } from "../lib/os-bridge";
import {
  classifyStatusScan,
  ProviderProbeUnreachableError,
  providerProbeReady,
  providerStatusesLoading,
  providerStatusesQueryKey,
  providerStatusesRefetchInterval,
} from "../lib/provider-statuses-query";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getVisibleProviders,
} from "../lib/providers";
import { queryKeys } from "../lib/query-keys";
import { type ProviderStatus, tauriProvider } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { useProviderCatalog } from "./use-provider-catalog";

export interface ProviderStatusScan {
  statuses: Record<string, ProviderStatus>;
  isLoading: boolean;
  isError: boolean;
}

export interface ProviderStatusesState extends ProviderStatusScan {
  refetch: () => Promise<ProviderStatusScan>;
}

export function useProviderStatuses(): ProviderStatusesState {
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  useProviderCatalog();
  const providerIds = getVisibleProviders({
    newEngine,
    desktop: osIsTauri(),
    capabilities: providerCapabilities,
  }).map((p) => p.id);
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const agentsLoading = useAgentStore((s) => s.loading);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const probeReady = providerProbeReady({
    loaded: agentsLoaded,
    loading: agentsLoading,
  });

  const query = useQuery({
    queryKey: providerStatusesQueryKey({
      base: queryKeys.providerStatuses(capabilities?.providers ?? null),
      providerIds,
      workspaceId,
    }),
    queryFn: async (): Promise<Record<string, ProviderStatus>> => {
      const scan = await tauriProvider.checkAllStatuses(providerIds);
      if (classifyStatusScan(providerIds, scan) === "unreachable")
        throw new ProviderProbeUnreachableError();
      return scan;
    },
    enabled: probeReady,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: (query) =>
      providerStatusesRefetchInterval({ status: query.state.status }),
  });

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async (): Promise<ProviderStatusScan> => {
    const result = await refetchQuery();
    return {
      statuses: result.data ?? {},
      isLoading: false,
      isError: result.isError,
    };
  }, [refetchQuery]);

  return {
    statuses: query.data ?? {},
    isLoading: providerStatusesLoading({
      hasData: query.data !== undefined,
      queryIsLoading: query.isLoading,
      probeReady,
    }),
    isError: query.isError,
    refetch,
  };
}
