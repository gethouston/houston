import type { AgentTeam } from "@houston/engine-adapter";
import { useQuery } from "@tanstack/react-query";
import {
  applyTeamContext,
  applyTeamIdentity,
  moveAgentInTeams,
  seedCreatedTeam,
} from "../../lib/agent-team-patches";
import { queryClient } from "../../lib/query-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgentTeams } from "../../lib/tauri";
import {
  SILENCE_EXPECTED,
  type TeamMemberVars,
  useAgentTeamWrite,
  useOptimisticAgentTeamWrite,
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
 *  a local grouping the host does not have. `refetch` is for the surfaces that
 *  REPORT a failed read (the org chart) instead of silently showing none. */
export function useAgentTeams(enabled: boolean): {
  teams: AgentTeam[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const query = useQuery({ ...agentTeamsQueryOptions(), enabled });
  return {
    teams: query.data,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
    refetch: query.refetch,
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

/** Create a team, and SEED it into the cached list in the same tick: the
 *  create-team form lands the user in the new team the moment this resolves,
 *  and the shell's view guard sends them home for a team the cache has yet to
 *  hear about (`lib/agent-team-patches.ts`). */
export function useCreateAgentTeam() {
  return useAgentTeamWrite(
    (input: { name: string; icon?: string; color?: string }) =>
      tauriAgentTeams.create(input, SILENCE_EXPECTED),
    { seed: seedCreatedTeam },
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

/** `surfaceExpected: false` belongs to ONE caller, the create-team form: it
 *  adds each picked person on their own and names every refusal together in a
 *  single summary toast, so the shared per-refusal toast would say the same
 *  thing again, once per person. Every other caller keeps it. */
export function useSetAgentTeamMemberOwner({ surfaceExpected = true } = {}) {
  return useAgentTeamWrite(
    ({ teamId, userId, owner }: TeamMemberVars & { owner: boolean }) =>
      tauriAgentTeams.setMemberOwner(teamId, userId, owner, SILENCE_EXPECTED),
    { membersOf: ({ teamId }) => teamId, surfaceExpected },
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
    { membersOf: ({ teamId }) => teamId },
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
  return useOptimisticAgentTeamWrite<
    { agentId: string; teamId: string },
    void,
    AgentTeam[]
  >(
    queryKeys.agentTeams(),
    ({ agentId, teamId }) =>
      tauriAgentTeams.setAgentTeam(agentId, teamId, SILENCE_EXPECTED),
    (cached, { agentId, teamId }) => moveAgentInTeams(cached, agentId, teamId),
  );
}

/**
 * Set a team's icon and/or color, OPTIMISTICALLY. The picker LIVE-APPLIES the
 * choice — the rail repaints the moment the user clicks a glyph, with no Save
 * step to wait behind — so the cached teams must agree before the round trip or
 * the block flickers back for the length of the request. A refusal restores the
 * snapshot, which IS the rollback: the old glyph visibly returns and the
 * expected-state toast says why.
 *
 * `""` in the patch CLEARS a field (C13's one spelling for "unset"), which
 * `applyTeamIdentity` mirrors, so the optimistic value is the value the next
 * read brings back.
 */
export function useSetAgentTeamIdentity() {
  return useOptimisticAgentTeamWrite<
    { teamId: string; patch: { icon?: string; color?: string } },
    AgentTeam,
    AgentTeam[]
  >(
    queryKeys.agentTeams(),
    ({ teamId, patch }) =>
      tauriAgentTeams.update(teamId, patch, SILENCE_EXPECTED),
    (cached, { teamId, patch }) => applyTeamIdentity(cached, teamId, patch),
  );
}

/**
 * Set a team's shared CONTEXT — the prose every agent of the team is given
 * before it starts a turn (C13 §Team context). Optimistic for the same reason
 * the identity picker is: the editor saves on blur, with no Save step to wait
 * behind, so the cache has to agree before the round trip or the textarea
 * repaints with the pre-save text under the user's cursor.
 *
 * `""` is an ordinary value here, not a CLEAR: the field is a text column with
 * an empty default, and its PRESENCE on the wire is what tells the client the
 * gateway supports team context at all (`teamContextSource`). Emptying a
 * context must therefore leave the editor standing, not make it vanish.
 */
export function useSetAgentTeamContext() {
  return useOptimisticAgentTeamWrite<
    { teamId: string; context: string },
    AgentTeam,
    AgentTeam[]
  >(
    queryKeys.agentTeams(),
    ({ teamId, context }) =>
      tauriAgentTeams.update(teamId, { context }, SILENCE_EXPECTED),
    (cached, { teamId, context }) => applyTeamContext(cached, teamId, context),
  );
}
