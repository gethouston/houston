import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { latestCachedAgentActivities } from "../../lib/all-conversations-cache";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity } from "../../lib/tauri";
import { useDraftStore } from "../../stores/drafts";

/**
 * ONE agent's activity list, as options. `useActivity` below and any
 * cross-agent fan-out (a team's Routines section reads every member's setup
 * chats to list its DRAFT routines) build from this, so they share the key, the
 * cache entry, the queryFn and the placeholder policy documented below — the
 * activity invalidation refreshes both and neither can serve a different truth.
 */
export function activityQueryOptions(qc: QueryClient, agentPath: string) {
  return {
    queryKey: queryKeys.activity(agentPath),
    queryFn: () => tauriActivity.list(agentPath),
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
    // at. Conversations are derived 1:1 from activities, so this agent's
    // rows in the always-swept cross-agent aggregate (the same rows the
    // sidebar badges paint from) ARE this board's missions.
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
    placeholderData: () => latestCachedAgentActivities(qc, agentPath),
  };
}

export function useActivity(agentPath: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    ...activityQueryOptions(queryClient, agentPath ?? ""),
    enabled: !!agentPath,
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

/**
 * An activity patch with the AGENT in the variables instead of in the hook
 * argument — the sibling of `useRoutineWritesForAnyAgent`, for the same reason:
 * a cross-agent list (a team's Routines and its DRAFT rows) knows which agent a
 * row belongs to only when the row is acted on, and hooks may not be called in
 * a loop over a roster that changes.
 */
export function useUpdateActivityForAnyAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentPath,
      activityId,
      update,
    }: {
      agentPath: string;
      activityId: string;
      update: { status?: string; title?: string; description?: string };
    }) => tauriActivity.update(agentPath, activityId, update),
    onSuccess: (_r, { agentPath }) =>
      qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) }),
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
