import { useQueryClient } from "@tanstack/react-query";
import {
  getCurrentAgentTeams,
  useUpdateAgentTeam,
} from "../../hooks/queries/use-agent-teams";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import {
  applyTeamSortOrder,
  teamSortOrderBetween,
} from "../../lib/agent-team-patches";
import { queryKeys } from "../../lib/query-keys";
import type { ItemDest } from "../../lib/sidebar-layout-ops";
import type { TeamView } from "../../lib/teams-model";

/** The two things a drag in the rail can move. */
export interface TeamDragWrites {
  /** An agent reordered inside its OWN team. */
  moveItem: (agentId: string, dest: ItemDest) => void;
  /** A whole team block moved above or below its siblings. */
  moveGroup: (groupId: string, beforeGroupId: string | null) => void;
}

/**
 * Everything a DRAG in the rail writes, on both backends.
 *
 * **A drag no longer changes what a team HOLDS.** Dropping an agent into
 * another block is not a valid gesture any more (`@houston-ai/layout` refuses
 * it before it can commit), so the only thing a drag can say is "this agent
 * sits here inside its team" or "this team sits here in the list". Moving an
 * agent between teams is an explicit, named action on the team screen — a
 * question worth a deliberate answer, not something a slip of the wrist over a
 * rail full of blocks can decide.
 *
 * That leaves ONE optimistic write here, the team reorder: off-capability it is
 * a plain stored-layout write, and on a server host the server owns team order
 * (`sortOrder`) while the stored layout is only the per-user ORDERING OVERLAY.
 * The agent reorder is the overlay's on both backends and needs no optimism,
 * because nothing about it round-trips.
 */
export function useTeamDragWrites({
  serverBacked,
  teams,
  sidebar,
}: {
  /** `hasAgentTeams(capabilities)` — the host owns the teams (C13). */
  serverBacked: boolean;
  /** The teams the rail DRAWS — every team the read served, since a member is
   *  now shown only the teams they are part of (the gateway filters the list). */
  teams: TeamView[];
  sidebar: UseSidebarLayout;
}): TeamDragWrites {
  const qc = useQueryClient();
  const update = useUpdateAgentTeam();
  const teamsKey = queryKeys.agentTeams();
  const defaultTeamId = teams.find((team) => team.isDefault)?.id ?? null;

  return {
    moveItem: (agentId, dest) => {
      // Off-capability the stored layout IS the model and `null` IS its default
      // section, so the drag's own destination goes through untouched.
      if (!serverBacked) {
        sidebar.moveItem(agentId, dest);
        return;
      }
      // The default block is the `isDefault` team, which here wears a real
      // server id, never `null`. The overlay records the position keyed by
      // SERVER team id, so it needs that same resolved id: keyed `null` it
      // writes to `ungroupedOrder`, which nothing reads on this backend.
      const teamId = dest.groupId ?? defaultTeamId;
      if (teamId === null) return;
      sidebar.moveItem(agentId, { ...dest, groupId: teamId });
    },

    moveGroup: (groupId, beforeGroupId) => {
      if (!serverBacked) {
        sidebar.moveGroup(groupId, beforeGroupId);
        return;
      }
      const prev = getCurrentAgentTeams();
      if (!prev) return;
      const sortOrder = teamSortOrderBetween(prev, groupId, beforeGroupId);
      // Nothing to send: the block landed where it already was. The overlay is
      // NOT written either — the server owns team order, so a stored group order
      // nothing reads is a write that only pretends to have done something.
      if (sortOrder === null) return;
      // Patched SYNCHRONOUSLY rather than from the mutation's `onMutate`: a
      // group drag releases its working copy the instant it ends, and a patch
      // landing a microtask later lets the block snap back to its old place for
      // a frame. The snapshot is taken here, so the rollback belongs here too.
      qc.setQueryData(teamsKey, applyTeamSortOrder(prev, groupId, sortOrder));
      update.mutate(
        { teamId: groupId, patch: { sortOrder } },
        { onError: () => qc.setQueryData(teamsKey, prev) },
      );
    },
  };
}
