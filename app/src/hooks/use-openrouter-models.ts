import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProvider, type ModelOption } from "../lib/providers";
import { openRouterModelsFromSlugs } from "../lib/openrouter-models";
import { loadOpenRouterModelSlugs } from "../lib/openrouter-models-prefs";

export const openRouterModelsQueryKey = ["openrouter-models"] as const;

export function useOpenRouterModels(): {
  models: readonly ModelOption[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: openRouterModelsQueryKey,
    queryFn: async () => openRouterModelsFromSlugs(await loadOpenRouterModelSlugs()),
    staleTime: 30_000,
  });
  return {
    models: query.data ?? getProviderFallbackModels(),
    isLoading: query.isLoading,
  };
}

function getProviderFallbackModels(): readonly ModelOption[] {
  return getProvider("openrouter")?.models ?? [];
}

export function useInvalidateOpenRouterModels(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: openRouterModelsQueryKey });
  };
}
