import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { latestCachedAgentActivities } from "../../lib/all-conversations-cache";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity } from "../../lib/tauri";
import { useDraftStore } from "../../stores/drafts";

export function useActivity(agentPath: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.activity(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriActivity.list(agentPath);
    },
    enabled: !!agentPath,
    // No `initialData: []` here on purpose. With it, the query is in
    // "success with empty data" the instant a consumer mounts, so any
    // empty-state UI gated on `items.length === 0` flashes for the
    // 50-500ms it takes the queryFn to round-trip through the Tauri
    // command and engine HTTP. On Windows where engine startup is
    // slower the flash can be a full second. Returning `undefined`
    // until the real data lands lets consumers distinguish "loading"
    // from "loaded and genuinely empty". All call sites already guard
    // reads with `(activities ?? []).map(...)`.
    //
    // Cold-open seeding: on a cloud boot this read is held for the whole
    // pod wake, and the disk-restored `["activity", X]` entry only exists
    // for agents whose board was open in a session that outlived the wake
    // plus the persist throttle — often not the very agent being looked
    // at. Conversations are derived 1:1 from activities, so the freshest
    // cached conversation rows (per-agent list or the always-swept
    // aggregate the sidebar badges paint from) ARE this board's missions.
    // Placeholder semantics keep the contract above: never persisted,
    // replaced by the held read when the pod answers, and `undefined`
    // (still loading) when nothing is cached — never a fabricated `[]`.
    //
    // The placeholder must ignore `placeholderData`'s previous-data argument
    // (HOU-858): that argument carries the PREVIOUS query key's data, and the
    // only way this key changes is an agent switch — so "previous data" is
    // always the previous AGENT's board, and serving it painted the old
    // agent's mission cards under the new agent until the fetch landed. Only
    // the agent-scoped cache lookup may seed the placeholder.
    placeholderData: () =>
      agentPath
        ? latestCachedAgentActivities(queryClient, agentPath)
        : undefined,
  });
}

export function useCreateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      title,
      description,
      agent,
    }: {
      title: string;
      description?: string;
      agent?: string;
    }) => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriActivity.create(agentPath, title, description, agent);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

export function useUpdateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      activityId,
      update,
    }: {
      activityId: string;
      update: { status?: string; title?: string; description?: string };
    }) => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriActivity.update(agentPath, activityId, update);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

export function useDeleteActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      if (!agentPath) throw new Error("agentPath required");
      await tauriActivity.delete(agentPath, activityId);
      // Files attached in this conversation stay in the workspace's uploads/
      // folder — they are agent context, not conversation scratch (HOU-706).
      // Clear any unsent draft for this conversation.
      useDraftStore.getState().clearDraft(`activity-${activityId}`);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

/** Patch many activities at once (bulk archive, bulk move-to). */
export function useBulkUpdateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      update,
    }: {
      ids: string[];
      update: { status?: string };
    }) => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriActivity.bulkUpdate(agentPath, ids, update);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

/** Delete many activities at once, wiping each one's draft. */
export function useBulkDeleteActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!agentPath) throw new Error("agentPath required");
      await tauriActivity.bulkDelete(agentPath, ids);
      // Attached files stay in the workspace's uploads/ folder (HOU-706).
      for (const id of ids) {
        useDraftStore.getState().clearDraft(`activity-${id}`);
      }
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}
