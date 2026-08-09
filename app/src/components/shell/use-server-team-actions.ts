import type { SidebarGroupAffordances } from "@houston-ai/layout";
import { useSetAgentTeamIdentity } from "../../hooks/queries";
import {
  useDeleteAgentTeam,
  useLeaveAgentTeam,
  useUpdateAgentTeam,
} from "../../hooks/queries/use-agent-teams";
import { useSession } from "../../hooks/use-session";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import type { TeamView } from "../../lib/teams-model";
import { teamAffordanceMask } from "./team-sidebar-model";
import { type TeamDragWrites, useTeamDragWrites } from "./use-team-drag-writes";

export interface UseServerTeamActionsArgs {
  /** `hasAgentTeams(capabilities)` — the host owns the teams (C13). */
  serverBacked: boolean;
  /** The teams the rail DRAWS — every team the read served, since a member is
   *  now shown only the teams they are part of (the gateway filters the list).
   *  There is no "other teams" bucket left to exclude. */
  teams: TeamView[];
  /** The stored-layout ops: the whole story off-capability, and the ORDERING
   *  OVERLAY (drop position, collapsed flag) on a server host. */
  sidebar: UseSidebarLayout;
  /** Off-capability only: the org-role gate on creating things. On a server
   *  host ANY member of the space may create a team (C13), so it is not read
   *  there. */
  canCreateAgents: boolean;
  /** Whether the ACTIVE space is a personal one (`usePersonalSpace`). It holds
   *  one human, so there is no membership to give up in it. */
  personalSpace: boolean;
}

export interface ServerTeamActions extends TeamDragWrites {
  /** Whether the rail offers "New team" at all. */
  canCreateTeam: boolean;
  /** This team's header-menu mask, or `undefined` off-capability (no mask at
   *  all, which is exactly the pre-C13 rendering). */
  affordancesFor: (team: TeamView) => SidebarGroupAffordances | undefined;
  renameGroup: (groupId: string, newName: string) => void;
  /** Set or clear a team's icon/colour. `null` CLEARS. Branches ONCE on the
   *  backend, like every other action here. */
  setIdentity: (
    teamId: string,
    patch: { icon?: string | null; color?: string | null },
  ) => void;
  deleteGroup: (groupId: string) => void;
  /** Server host only, and never in a personal space: give up the caller's own
   *  membership. */
  leaveGroup: ((groupId: string) => void) | undefined;
}

/**
 * Every WRITE the sidebar's team blocks can perform, routed to the backend that
 * owns them. One hook rather than a dozen call sites in `sidebar.tsx`, so the
 * two backends can never diverge halfway: each action below branches EXACTLY
 * ONCE on `serverBacked`, and the off-capability branch is the code that
 * shipped before C13, unchanged.
 *
 * The two DRAG writes come from `use-team-drag-writes.ts` and are re-exported
 * whole, so the rail still has ONE actions object. They live apart because they
 * are the only ones that patch a cache optimistically and must undo it, and
 * that shape is worth stating once for both rather than twice.
 *
 * Every mutation here already owns its error surface (`agent-team-write.ts`:
 * expected gateway states become an informational toast, anything else becomes
 * `call()`'s report-a-bug pair), so the menu actions below add no `onError` of
 * their own; the two optimistic ones add exactly one, for their own rollback.
 */
export function useServerTeamActions({
  serverBacked,
  teams,
  sidebar,
  canCreateAgents,
  personalSpace,
}: UseServerTeamActionsArgs): ServerTeamActions {
  const selfId = useSession().data?.uid ?? null;
  const update = useUpdateAgentTeam();
  const remove = useDeleteAgentTeam();
  const leave = useLeaveAgentTeam();
  const setIdentityMutation = useSetAgentTeamIdentity();
  // The two DRAG writes are their own module: they are the only actions here
  // that patch a cache optimistically and undo it, and keeping that shape in
  // one place is what stops the agent move and the team reorder drifting apart.
  const drag = useTeamDragWrites({ serverBacked, teams, sidebar });

  return {
    // On a server host creating a team is not an admin power: teams are how a
    // space organizes itself, and any member may add one.
    canCreateTeam: serverBacked || canCreateAgents,
    affordancesFor: teamAffordanceMask({
      serverBacked,
      personalSpace,
      selfId,
    }),
    renameGroup: (groupId, newName) => {
      if (serverBacked)
        update.mutate({ teamId: groupId, patch: { name: newName } });
      else sidebar.renameGroup(groupId, newName);
    },
    // Two spellings of "clear" meet here: the stored layout takes `null`, the
    // wire takes the EMPTY STRING, and an OMITTED field means "leave this one
    // alone" on both. The translation happens once, here, so every caller above
    // speaks only `null`. No `onError`: the mutation is optimistic and owns its
    // snapshot, rollback and expected-error surface (`agent-team-write.ts`).
    setIdentity: (teamId, patch) => {
      if (serverBacked) {
        setIdentityMutation.mutate({
          teamId,
          patch: {
            ...(patch.icon !== undefined ? { icon: patch.icon ?? "" } : {}),
            ...(patch.color !== undefined ? { color: patch.color ?? "" } : {}),
          },
        });
        return;
      }
      sidebar.setGroupIdentity(teamId, patch);
    },
    deleteGroup: (groupId) => {
      if (serverBacked) remove.mutate(groupId);
      else sidebar.deleteGroup(groupId);
    },
    leaveGroup:
      serverBacked && !personalSpace && selfId !== null
        ? (groupId) => leave.mutate({ teamId: groupId, userId: selfId })
        : undefined,
    moveItem: drag.moveItem,
    moveGroup: drag.moveGroup,
  };
}
