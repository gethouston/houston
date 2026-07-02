import type { OrgRole } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgents, tauriOrg } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * The current user's org (identity + role, plus the roster for owner/admin).
 * Multiplayer-only: on a single-player/desktop host `getOrg()` throws, so the
 * query stays disabled unless the caller passes `enabled` (the Members surface
 * gates on `capabilities.multiplayer`). One org per user, so it's app-scoped.
 */
export function useOrg(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.org(),
    queryFn: () => tauriOrg.get(),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * The mutations below carry no `onError`: their `mutationFn` routes through the
 * `tauriOrg.*` / `tauriAgents.*` wrappers, each wrapped by the `call()` adapter
 * in `lib/tauri.ts`. `call()` already surfaces the real error as a red toast AND
 * reports it to Sentry before re-throwing (React Query swallows the re-throw
 * internally, so `.mutate()` never leaks). The "last owner" 409 and "user
 * already in another org" 409 from the gateway reach the user through that same
 * path. Adding an `onError` here would double-toast.
 */
export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: OrgRole }) =>
      tauriOrg.addMember(email, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.org() }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => tauriOrg.removeMember(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.org() }),
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      tauriOrg.setMemberRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.org() }),
  });
}

/**
 * Replace which org members may use an agent. The agent list is Zustand state
 * (`useAgentStore`), not a React Query cache, so its reactive path is a store
 * reload — a silent `loadAgents` re-pulls `assignedUserIds`/`assigned` for the
 * current workspace, which re-renders every consumer just like an invalidation
 * would. (The host also emits `AgentsChanged` to affected members; this reload
 * covers the acting user's own view immediately.)
 */
export function useSetAgentAssignments() {
  return useMutation({
    mutationFn: ({
      agentSlugOrId,
      userIds,
    }: {
      agentSlugOrId: string;
      userIds: string[];
    }) => tauriAgents.setAssignments(agentSlugOrId, userIds),
    onSuccess: () => {
      const workspaceId = useWorkspaceStore.getState().current?.id;
      if (workspaceId) {
        void useAgentStore.getState().loadAgents(workspaceId, { silent: true });
      }
    },
  });
}
