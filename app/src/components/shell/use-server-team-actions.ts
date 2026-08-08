import type {
  SidebarGroupAffordances,
  SidebarGroupView,
} from "@houston-ai/layout";
import { useState } from "react";
import {
  useCreateAgentTeam,
  useDeleteAgentTeam,
  useLeaveAgentTeam,
  useUpdateAgentTeam,
} from "../../hooks/queries/use-agent-teams";
import { useSession } from "../../hooks/use-session";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import {
  canDeleteTeam,
  canLeaveTeam,
  canRenameTeam,
  type TeamView,
} from "../../lib/teams-model";
import { DRAFT_TEAM_ID } from "./team-sidebar-model";
import { type TeamDragWrites, useTeamDragWrites } from "./use-team-drag-writes";

export interface UseServerTeamActionsArgs {
  /** `hasAgentTeams(capabilities)` — the host owns the teams (C13). */
  serverBacked: boolean;
  /** The teams the rail DRAWS (`partitionTeams(...).joined`). */
  teams: TeamView[];
  /** The stored-layout ops: the whole story off-capability, and the ORDERING
   *  OVERLAY (drop position, collapsed flag) on a server host. */
  sidebar: UseSidebarLayout;
  /** Off-capability only: the placeholder name a new local group is born with,
   *  which the user then renames. A server host never sends a placeholder. */
  newTeamName: string;
  /** Off-capability only: the org-role gate on creating things. On a server
   *  host ANY member of the space may create a team (C13), so it is not read
   *  there. */
  canCreateAgents: boolean;
}

export interface ServerTeamActions extends TeamDragWrites {
  /** Whether the rail offers "New team" at all. */
  canCreateTeam: boolean;
  /** The rail's "New team" action, whichever backend answers. */
  createTeam: () => void;
  /** The not-yet-real team row to append to `groups`, or null. */
  draftGroup: SidebarGroupView | null;
  /** The group to open straight into inline rename (a just-created one). */
  renamingGroupId: string | null;
  onRenamingGroupIdHandled: () => void;
  /** This team's header-menu mask, or `undefined` off-capability (no mask at
   *  all, which is exactly the pre-C13 rendering). */
  affordancesFor: (team: TeamView) => SidebarGroupAffordances | undefined;
  renameGroup: (groupId: string, newName: string) => void;
  deleteGroup: (groupId: string) => void;
  /** Server host only: give up the caller's own membership. */
  leaveGroup: ((groupId: string) => void) | undefined;
  /** Server host only: an abandoned inline rename, which retires the draft. */
  cancelRenameGroup: ((groupId: string) => void) | undefined;
}

/**
 * Every WRITE the sidebar's team blocks can perform, routed to the backend that
 * owns them. One hook rather than a dozen call sites in `sidebar.tsx`, so the
 * two backends can never diverge halfway: each action below branches EXACTLY
 * ONCE on `serverBacked`, and the off-capability branch is the code that
 * shipped before C13, unchanged.
 *
 * CREATE is the one flow that differs in shape, not just in destination.
 * Locally a group is minted immediately with a placeholder name ("New team")
 * and renamed in place, which is harmless: the layout is the user's own. In a
 * shared space that placeholder would be BROADCAST to everyone the instant it
 * is clicked. So a server host mints nothing: "New team" adds a local draft row
 * that only this user sees, opens it into inline rename, and POSTs the team
 * with the typed name on commit. An abandoned rename (Escape, or leaving the
 * field empty or unchanged) retires the draft through `onCancelRenameGroup`,
 * which is the only signal that tells an abandoned name from a pending one.
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
  newTeamName,
  canCreateAgents,
}: UseServerTeamActionsArgs): ServerTeamActions {
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const selfId = useSession().data?.uid ?? null;
  const create = useCreateAgentTeam();
  const update = useUpdateAgentTeam();
  const remove = useDeleteAgentTeam();
  const leave = useLeaveAgentTeam();
  // The two DRAG writes are their own module: they are the only actions here
  // that patch a cache optimistically and undo it, and keeping that shape in
  // one place is what stops the agent move and the team reorder drifting apart.
  const drag = useTeamDragWrites({ serverBacked, teams, sidebar });

  const createTeam = () => {
    if (serverBacked) {
      setDrafting(true);
      setRenamingGroupId(DRAFT_TEAM_ID);
      return;
    }
    const id = sidebar.createGroup(newTeamName);
    if (id) setRenamingGroupId(id);
  };

  return {
    // On a server host creating a team is not an admin power: teams are how a
    // space organizes itself, and any member may add one.
    canCreateTeam: serverBacked || canCreateAgents,
    createTeam,
    // Empty name, no sections, no affordances: there is nothing yet to open,
    // rename or delete, and the only thing that can happen to it is being named.
    draftGroup:
      serverBacked && drafting
        ? {
            id: DRAFT_TEAM_ID,
            name: "",
            collapsed: false,
            itemIds: [],
            sections: [],
            affordances: {},
          }
        : null,
    renamingGroupId,
    onRenamingGroupIdHandled: () => setRenamingGroupId(null),
    affordancesFor: (team) =>
      serverBacked
        ? {
            rename: canRenameTeam(team),
            delete: canDeleteTeam(team),
            // A group's shared context is a stored-layout field, and on a
            // server host nothing reads it: offering the editor would promise
            // an effect the agents would never see.
            context: false,
            // No session id means no `:userId` to send, so there is no call to
            // make: hide the affordance rather than offer a dead one.
            leave: canLeaveTeam(team) && selfId !== null,
          }
        : undefined,
    renameGroup: (groupId, newName) => {
      if (groupId === DRAFT_TEAM_ID) {
        // The commit IS the create: this is the first and only moment the name
        // exists, and the draft has served its purpose.
        setDrafting(false);
        create.mutate(newName);
        return;
      }
      if (serverBacked)
        update.mutate({ teamId: groupId, patch: { name: newName } });
      else sidebar.renameGroup(groupId, newName);
    },
    deleteGroup: (groupId) => {
      if (serverBacked) remove.mutate(groupId);
      else sidebar.deleteGroup(groupId);
    },
    leaveGroup:
      serverBacked && selfId !== null
        ? (groupId) => leave.mutate({ teamId: groupId, userId: selfId })
        : undefined,
    cancelRenameGroup: serverBacked
      ? (groupId) => {
          if (groupId === DRAFT_TEAM_ID) setDrafting(false);
        }
      : undefined,
    moveItem: drag.moveItem,
    moveGroup: drag.moveGroup,
  };
}
