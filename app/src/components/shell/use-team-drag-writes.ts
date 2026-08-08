import { useQueryClient } from "@tanstack/react-query";
import {
  getCurrentAgentTeams,
  useMoveAgentToTeam,
  useUpdateAgentTeam,
} from "../../hooks/queries/use-agent-teams";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import {
  applyTeamSortOrder,
  crossTeamDropOverlay,
  teamSortOrderBetween,
} from "../../lib/agent-team-patches";
import { queryKeys } from "../../lib/query-keys";
import type { ItemDest } from "../../lib/sidebar-layout-ops";
import { type TeamView, teamOfAgent } from "../../lib/teams-model";
import { DRAFT_TEAM_ID } from "./team-sidebar-model";

/** The two things a drag in the rail can move. */
export interface TeamDragWrites {
  /** An agent moved inside its team, or into another one. */
  moveItem: (agentId: string, dest: ItemDest) => void;
  /** A whole team block moved above or below its siblings. */
  moveGroup: (groupId: string, beforeGroupId: string | null) => void;
}

/**
 * Everything a DRAG in the rail writes, on both backends.
 *
 * Off-capability both are one write to the stored layout, which IS the model
 * there — that branch is the code that shipped before C13, untouched. On a
 * server host neither is: the server owns which team holds an agent and the
 * order the teams come in, while the stored layout is only the per-user
 * ORDERING OVERLAY (where inside a block an agent sits, and whether the block
 * is folded).
 *
 * Both server-side writes are OPTIMISTIC and both roll their own snapshot back,
 * because in each case the gesture has already animated and a round trip's
 * worth of snapping back is the thing the user would report. The two follow the
 * SAME shape deliberately: take the snapshot, patch, fire, restore on refusal.
 */
export function useTeamDragWrites({
  serverBacked,
  teams,
  sidebar,
}: {
  /** `hasAgentTeams(capabilities)` — the host owns the teams (C13). */
  serverBacked: boolean;
  /** The teams the rail DRAWS (`partitionTeams(...).joined`). */
  teams: TeamView[];
  sidebar: UseSidebarLayout;
}): TeamDragWrites {
  const qc = useQueryClient();
  const move = useMoveAgentToTeam();
  const update = useUpdateAgentTeam();
  const teamsKey = queryKeys.agentTeams();
  const defaultTeamId = teams.find((team) => team.isDefault)?.id ?? null;

  return {
    moveItem: (agentId, dest) => {
      // The draft holds nothing until it exists on the server, so a drop onto
      // it is ignored whole, overlay write included.
      if (dest.groupId === DRAFT_TEAM_ID) return;
      // Off-capability the stored layout IS the model and `null` IS its default
      // section, so the drag's own destination goes through untouched.
      if (!serverBacked) {
        sidebar.moveItem(agentId, dest);
        return;
      }
      // The default block is the `isDefault` team, which here wears a real
      // server id, never `null`. The overlay records the drop POSITION keyed by
      // SERVER team id, so it needs that same resolved id: keyed `null` it
      // writes to `ungroupedOrder`, which nothing reads on this backend.
      const teamId = dest.groupId ?? defaultTeamId;
      if (teamId === null) return;
      const target = { ...dest, groupId: teamId };
      // Same-team reorder: nothing moved teams, so there is nothing to tell the
      // server, and the ambient normalizer already sees the right roster.
      if (teamOfAgent(teams, agentId)?.id === teamId) {
        sidebar.moveItem(agentId, target);
        return;
      }
      // A cross-team drop is TWO optimistic writes that must agree. The overlay
      // is pruned against the roster this move ASSERTS, never the one still
      // cached (`crossTeamDropOverlay` says why), and the layout it replaces is
      // kept so a refusal puts BOTH caches back exactly as they were.
      const prevLayout = sidebar.applyOp(
        (current) =>
          crossTeamDropOverlay(
            current,
            getCurrentAgentTeams() ?? [],
            agentId,
            target,
          ),
        null,
      );
      move.mutate(
        { agentId, teamId },
        {
          // The teams cache and the toast are the mutation's own (it snapshots
          // and restores them); the overlay write is this call site's, so its
          // rollback is this call site's too.
          onError: () => {
            if (prevLayout) sidebar.applyOp(() => prevLayout, null);
          },
        },
      );
    },

    moveGroup: (groupId, beforeGroupId) => {
      if (!serverBacked) {
        sidebar.moveGroup(groupId, beforeGroupId);
        return;
      }
      // The draft is not a team yet: it cannot move, and nothing can be ordered
      // against it either.
      if (groupId === DRAFT_TEAM_ID) return;
      const prev = getCurrentAgentTeams();
      if (!prev) return;
      const sortOrder = teamSortOrderBetween(
        prev,
        groupId,
        beforeGroupId === DRAFT_TEAM_ID ? null : beforeGroupId,
      );
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
