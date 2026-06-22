import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConfig } from "../../lib/tauri";

/**
 * The agent's `.houston/config/config.json` (provider/model/effort + extras).
 *
 * Reactive: the file watcher + `ConfigChanged` event invalidate
 * `queryKeys.config(agentPath)`, so a model change elsewhere reflects here
 * without a remount.
 */
export function useAgentConfig(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.config(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriConfig.read(agentPath);
    },
    enabled: !!agentPath,
  });
}
