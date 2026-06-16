import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriAttachments } from "../../lib/tauri";
import { useDraftStore } from "../../stores/drafts";

export function useActivity(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activity(agentPath ?? ""),
    queryFn: () => tauriActivity.list(agentPath!),
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
  });
}

export function useCreateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, description, agent }: {
      title: string;
      description?: string;
      agent?: string;
    }) =>
      tauriActivity.create(agentPath!, title, description, agent),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

export function useUpdateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, update }: { activityId: string; update: { status?: string; title?: string; description?: string } }) =>
      tauriActivity.update(agentPath!, activityId, update),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

export function useDeleteActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      await tauriActivity.delete(agentPath!, activityId);
      // Wipe any attachments associated with this conversation. Idempotent.
      await tauriAttachments.delete(`activity-${activityId}`).catch(() => {});
      // Clear any unsent draft for this conversation.
      useDraftStore.getState().clearDraft(`activity-${activityId}`);
    },
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

/** Patch many activities at once (bulk archive, bulk move-to). */
export function useBulkUpdateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, update }: { ids: string[]; update: { status?: string } }) =>
      tauriActivity.bulkUpdate(agentPath!, ids, update),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

/** Delete many activities at once, wiping each one's attachments + draft. */
export function useBulkDeleteActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await tauriActivity.bulkDelete(agentPath!, ids);
      for (const id of ids) {
        // Per-conversation cleanup is idempotent + best-effort; the bulk
        // delete above already succeeded, so a stray attachment/draft must
        // not fail the whole action.
        await tauriAttachments.delete(`activity-${id}`).catch(() => {});
        useDraftStore.getState().clearDraft(`activity-${id}`);
      }
    },
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}
