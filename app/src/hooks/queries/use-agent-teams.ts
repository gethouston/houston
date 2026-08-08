import type { AgentTeam } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moveAgentInTeams } from "../../lib/agent-team-patches";
import { queryClient } from "../../lib/query-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgentTeams } from "../../lib/tauri";
import {
  SILENCE_EXPECTED,
  surfaceExpectedAgentTeamError,
  type TeamMemberVars,
  useAgentTeamWrite,
} from "./agent-team-write";

/**
 * C13 agent teams: the SERVER backend of `useTeams()` plus every write onto it.
 * Only an `agentTeams` gateway serves them, so each read takes an `enabled`
 * flag from that capability: disabled, it never reaches the adapter, which
 * throws off-gateway rather than degrading to a misleading empty list. The
 * shared write plumbing (silencing + the expected-state surface) is
 * `agent-team-write.ts`, so no mutation below can wire it differently.
 */
export function agentTeamsQueryOptions() {
  return {
    queryKey: queryKeys.agentTeams(),
    queryFn: () => tauriAgentTeams.list(),
    staleTime: 30_000,
  };
}

/** The space's teams as the CALLER sees them. `teams` stays `undefined` until
 *  the first read lands, which the seam reads as "no teams yet" rather than as
 *  a local grouping the host does not have. */
export function useAgentTeams(enabled: boolean): {
  teams: AgentTeam[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({ ...agentTeamsQueryOptions(), enabled });
  return {
    teams: query.data,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
  };
}

/** The teams RIGHT NOW, outside React (a keyboard shortcut, a notification):
 *  the same cache entry `useAgentTeams` fills, so the rail and a shortcut can
 *  never resolve different teams. */
export function getCurrentAgentTeams(): AgentTeam[] | undefined {
  return queryClient.getQueryData<AgentTeam[]>(queryKeys.agentTeams());
}

/** One team's EXPLICIT membership rows (the Members card). `teamId === null`
 *  keeps the query idle: the surface mounts before a team is chosen. */
export function useAgentTeamMembers(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agentTeamMembers(teamId ?? ""),
    queryFn: () => tauriAgentTeams.members(teamId as string),
    enabled: enabled && teamId !== null,
    staleTime: 30_000,
  });
}

export function useCreateAgentTeam() {
  return useAgentTeamWrite((name: string) =>
    tauriAgentTeams.create(name, SILENCE_EXPECTED),
  );
}

export function useUpdateAgentTeam() {
  return useAgentTeamWrite(
    (vars: { teamId: string; patch: { name?: string; sortOrder?: number } }) =>
      tauriAgentTeams.update(vars.teamId, vars.patch, SILENCE_EXPECTED),
  );
}

export function useDeleteAgentTeam() {
  return useAgentTeamWrite((teamId: string) =>
    tauriAgentTeams.remove(teamId, SILENCE_EXPECTED),
  );
}

export function useJoinAgentTeam() {
  return useAgentTeamWrite(
    (teamId: string) => tauriAgentTeams.join(teamId, SILENCE_EXPECTED),
    (teamId) => teamId,
  );
}

export function useSetAgentTeamMemberOwner() {
  return useAgentTeamWrite(
    ({ teamId, userId, owner }: TeamMemberVars & { owner: boolean }) =>
      tauriAgentTeams.setMemberOwner(teamId, userId, owner, SILENCE_EXPECTED),
    ({ teamId }) => teamId,
  );
}

/** Leaving and removing someone are ONE wire call with a different user id, so
 *  they share this, but they stay two exported names below: they are two
 *  different ACTIONS at the call sites (the rail's Leave, the Members card's
 *  Remove), and a call site should name what the user did. */
function useAgentTeamMemberRemoval() {
  return useAgentTeamWrite(
    ({ teamId, userId }: TeamMemberVars) =>
      tauriAgentTeams.removeMember(teamId, userId, SILENCE_EXPECTED),
    ({ teamId }) => teamId,
  );
}
export const useLeaveAgentTeam = useAgentTeamMemberRemoval;
export const useRemoveAgentTeamMember = useAgentTeamMemberRemoval;

/**
 * Move one agent between teams, OPTIMISTICALLY: the drop already animated the
 * agent into its new block, so the cached teams must agree before the round
 * trip or the rail snaps back for the length of the request. A refusal restores
 * the snapshot, which IS the rollback: the agent visibly returns where it was,
 * and the expected-state toast says why.
 */
export function useMoveAgentToTeam() {
  const qc = useQueryClient();
  const key = queryKeys.agentTeams();
  return useMutation({
    mutationFn: ({ agentId, teamId }: { agentId: string; teamId: string }) =>
      tauriAgentTeams.setAgentTeam(agentId, teamId, SILENCE_EXPECTED),
    onMutate: async ({ agentId, teamId }) => {
      // Cancel first: a read landing after the patch would overwrite it.
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentTeam[]>(key);
      if (prev) qc.setQueryData(key, moveAgentInTeams(prev, agentId, teamId));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      // Nothing cached meant nothing patched, so nothing to restore either.
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      surfaceExpectedAgentTeamError(err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
