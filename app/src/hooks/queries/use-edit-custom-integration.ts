import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";

export function useEditCustomIntegration(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; name: string; website: string }) =>
      tauriIntegrations.customUpdateDetails(
        input.slug,
        { name: input.name, website: input.website },
        agentId,
      ),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.customIntegrations() }),
        qc.invalidateQueries({
          queryKey: queryKeys.integrationConnections("custom"),
        }),
      ]);
    },
  });
}
