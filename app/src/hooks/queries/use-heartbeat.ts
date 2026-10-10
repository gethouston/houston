import type {
  HeartbeatSettingsPatch,
  HeartbeatState,
} from "@houston/wire-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tauriHeartbeat } from "../../lib/heartbeat-facade";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";

/**
 * The AI Manager's morning-briefing settings + last run. Refreshed by the
 * host's `HeartbeatChanged` event (the daemon recording a run, the manager
 * changing the time for the person), never load-on-mount only.
 */
export function useHeartbeat(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.heartbeat(),
    queryFn: ({ signal }) => tauriHeartbeat.get(signal),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Change the settings, painted now and rolled back (and told) on refusal: a
 * switch that snaps back with no word reads as a broken switch.
 */
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

/** "Brief me now". The caller decides what each outcome tells the person. */
export function useRunHeartbeatNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tauriHeartbeat.runNow(),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.heartbeat() }),
  });
}
