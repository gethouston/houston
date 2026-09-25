import { queryOptions, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConfig } from "../../lib/tauri";

/**
 * The query for an agent's `.houston/config/config.json`: ONE key and ONE
 * reader for every surface that reads it, alone (`useAgentConfig`) or many at
 * once (`useQueries`), so they all share the cache entries the config event
 * invalidation refreshes. A failed read is reported by the engine call itself.
 */
export function agentConfigQueryOptions(agentPath: string | undefined) {
  return queryOptions({
    queryKey: queryKeys.config(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriConfig.read(agentPath);
    },
    enabled: !!agentPath,
  });
}

/**
 * The agent's `.houston/config/config.json` (provider/model/effort + extras).
 *
 * Reactive: the file watcher + `ConfigChanged` event invalidate
 * `queryKeys.config(agentPath)`, so a model change elsewhere reflects here
 * without a remount.
 */
export function useAgentConfig(agentPath: string | undefined) {
  return useQuery(agentConfigQueryOptions(agentPath));
}
