import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Config } from "../../data/config";
import { readAgentConfig } from "../../lib/agent-provisioning/born-config";
import { isAgentPathCreating } from "../../lib/agent-warming-guard";
import { queryKeys } from "../../lib/query-keys";
import { tauriConfig } from "../../lib/tauri";

export function agentConfigQueryOptions(agentPath: string | undefined) {
  return queryOptions({
    queryKey: queryKeys.config(agentPath ?? ""),
    queryFn: ({ client, queryKey }) => {
      if (!agentPath) throw new Error("agentPath required");
      return readAgentConfig({
        creating: isAgentPathCreating(agentPath),
        cached: client.getQueryData<Config>(queryKey),
        read: () => tauriConfig.read(agentPath),
      });
    },
    enabled: !!agentPath,
  });
}

export function useAgentConfig(agentPath: string | undefined) {
  return useQuery(agentConfigQueryOptions(agentPath));
}
