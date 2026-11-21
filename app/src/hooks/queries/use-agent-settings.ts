import type { AgentSettings } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgentSettings } from "../../lib/tauri";

export function useAgentSettings(agentId: string, enabled: boolean) {
  return useQuery(agentSettingsQueryOptions(agentId, enabled));
}

export function agentSettingsQueryOptions(
  agentId: string,
  enabled: boolean,
  quiet = false,
) {
  return {
    queryKey: queryKeys.agentSettings(agentId),
    queryFn: () =>
      quiet
        ? tauriAgentSettings.getQuiet(agentId)
        : tauriAgentSettings.get(agentId),
    enabled,
    staleTime: 30_000,
  };
}

export function useSetAgentSettings(agentId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation("teams");
  const key = queryKeys.agentSettings(agentId);
  return useMutation({
    mutationFn: (allowedToolkits: string[] | null) =>
      tauriAgentSettings.set(agentId, { allowedToolkits }),
    onMutate: async (allowedToolkits) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSettings>(key);
      if (prev) {
        qc.setQueryData<AgentSettings>(key, { ...prev, allowedToolkits });
      }
      return { prev };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      tellOptimisticRefusal("set_agent_settings", err, {
        title: t("writeFailed.agentApps.title"),
        description: t("writeFailed.agentApps.description"),
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useSetAgentAllowedModels(agentId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation("teams");
  const key = queryKeys.agentSettings(agentId);
  return useMutation({
    mutationFn: (allowedModels: string[] | null) =>
      tauriAgentSettings.set(agentId, { allowedModels }),
    onMutate: async (allowedModels) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSettings>(key);
      if (prev) {
        qc.setQueryData<AgentSettings>(key, { ...prev, allowedModels });
      }
      return { prev };
    },
    onSuccess: (_data, allowedModels) => {
      analytics.track("models_allowlist_updated", {
        agent_id: agentId,
        source: allowedModels === null ? "any" : "picked",
      });
    },
    onError: (err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      tellOptimisticRefusal("set_agent_allowed_models", err, {
        title: t("writeFailed.agentModels.title"),
        description: t("writeFailed.agentModels.description"),
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
