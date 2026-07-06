import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Config } from "../../../data/config";
import { queryKeys } from "../../../lib/query-keys";
import { tauriConfig } from "../../../lib/tauri";
import { useUIStore } from "../../../stores/ui";

export interface AgentModelPatch {
  provider?: string;
  model?: string;
  effort?: string;
}

/**
 * Persist an agent's pinned provider / model / reasoning effort to its
 * `.houston/config/config.json` — the SAME file the composer's model picker
 * writes. Read-merge-write so a partial patch (just the effort, say) keeps the
 * rest. `tauriConfig.write` does not route through the auto-toasting `call()`
 * wrapper, so surface failures here (no silent failure); the config query
 * invalidation reflects the new pin without a remount.
 */
export function useSaveAgentModel(agentPath: string) {
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useTranslation("chat");
  return useMutation({
    mutationFn: async (patch: AgentModelPatch) => {
      const cfg = await tauriConfig.read(agentPath);
      const next: Config = { ...cfg };
      if (patch.provider !== undefined) {
        next.provider = patch.provider as Config["provider"];
      }
      if (patch.model !== undefined) next.model = patch.model;
      if (patch.effort !== undefined) {
        next.effort = patch.effort as Config["effort"];
      }
      await tauriConfig.write(agentPath, next);
    },
    onError: (err) =>
      addToast({
        title: t("errors.modelPersistFailed"),
        description: String(err),
        variant: "error",
      }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.config(agentPath) }),
  });
}
