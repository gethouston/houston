import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpenRouterCatalogModel } from "@houston-ai/engine-client";
import { fetchOpenRouterCatalog } from "../lib/openrouter-catalog-api";
import { OPENROUTER_CATALOG_STALE_MS } from "../lib/openrouter-catalog";
import { queryKeys } from "../lib/query-keys";
import { useProviderStatuses } from "./use-provider-statuses";

export function useOpenRouterCatalog(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.openRouterCatalog(),
    queryFn: () => fetchOpenRouterCatalog(),
    staleTime: OPENROUTER_CATALOG_STALE_MS,
    enabled: options?.enabled ?? true,
  });
}

export function useSeedOpenRouterCatalogCache(): (models: OpenRouterCatalogModel[]) => void {
  const qc = useQueryClient();
  return (models) => {
    qc.setQueryData(queryKeys.openRouterCatalog(), models);
  };
}

export function useInvalidateOpenRouterCatalog(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.openRouterCatalog() });
  };
}

export function usePrefetchOpenRouterCatalog(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.prefetchQuery({
      queryKey: queryKeys.openRouterCatalog(),
      queryFn: () => fetchOpenRouterCatalog(),
      staleTime: OPENROUTER_CATALOG_STALE_MS,
    });
  };
}

/** Background warm when OpenRouter is authenticated so manage-models opens instantly. */
export function useOpenRouterCatalogWarmup(): void {
  const { statuses } = useProviderStatuses();
  const prefetch = usePrefetchOpenRouterCatalog();

  useEffect(() => {
    const status = statuses.openrouter;
    if (!status?.cli_installed || status.auth_state !== "authenticated") return;
    prefetch();
  }, [prefetch, statuses.openrouter]);
}
