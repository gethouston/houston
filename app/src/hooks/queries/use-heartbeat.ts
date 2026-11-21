import type {
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "@houston/wire-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tauriHeartbeat } from "../../lib/heartbeat-facade";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";

export function useHeartbeat(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.heartbeat(),
    queryFn: ({ signal }) => tauriHeartbeat.get(signal),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSetHeartbeat() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const key = queryKeys.heartbeat();
  return useMutation({
    mutationFn: (patch: HeartbeatSettingsPatch) => tauriHeartbeat.set(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<HeartbeatState>(key);
      if (prev) qc.setQueryData<HeartbeatState>(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      tellOptimisticRefusal("set_heartbeat", err, {
        title: t("writeFailed.morningBriefing.title"),
        description: t("writeFailed.morningBriefing.description"),
      });
    },
    onSuccess: (state) => {
      qc.setQueryData(key, state);
    },
  });
}

export function useRunHeartbeatNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tauriHeartbeat.runNow(),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.heartbeat() }),
  });
}
