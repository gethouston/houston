import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
  SidebarItem,
  SidebarNavItemEntry,
} from "@houston-ai/layout";
import { AppSidebar } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import type { TeamView } from "../../lib/teams-model";
import type { Workspace } from "../../lib/types";
import { TEAM_NAME_MAX_RUNES } from "../team-view/team-members-model";
import { SidebarInviteInbox } from "./pending-invites";
import { buildSidebarLabels, SidebarWorkspaceHeader } from "./sidebar-chrome";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarNewTeamButton } from "./sidebar-new-team-button";
import type { ServerTeamActions } from "./use-server-team-actions";
import { tourAnchor } from "./workspace-tour-steps.ts";

/** Everything the rail RENDERS, resolved by `Sidebar` and handed over whole. */
export interface SidebarRailModel {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpand: () => void;
  onCreateWorkspace: () => void;
  onSwitchWorkspace: (id: string) => void;
  navItems: SidebarNavItemEntry[];
  activeNavId: string | undefined;
  teamActions: ServerTeamActions;
  items: SidebarItem[];
  groups: SidebarGroupView[];
  defaultGroup: SidebarDefaultGroupView | undefined;
  /** The teams of this space the caller has not joined. */
  otherTeams: TeamView[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onToggleGroupCollapsed: (id: string) => void;
  onEditGroupContext: (id: string) => void;
  /** Absent when this caller may not create agents. */
  onAddAgent: (() => void) | undefined;
  onRenameAgent: (id: string, name: string) => void;
  onDeleteAgent: (id: string) => void;
}

/**
 * The rail itself: one `AppSidebar` invocation, fed entirely by the view model
 * `Sidebar` composed. It renders TWICE — as the fixed desktop rail and inside
 * the mobile drawer — from the same element type, so switching presentation
 * never remounts the sidebar tree. Mobile is always expanded: collapse is a
 * rail concept.
 *
 * A component and not a closure inside `Sidebar` because that file was over the
 * 200-line limit and this is the cohesive half: everything here is "what the
 * rail LOOKS like", everything left there is "what the rail knows".
 */
export function SidebarRail({
  model,
  t,
  mobile,
  gutterChildren,
}: {
  model: SidebarRailModel;
  t: TFunction<["shell", "common", "portable", "teams", "agents"]>;
  /** Hosted in the mobile drawer (always expanded, no collapse toggle). */
  mobile: boolean;
  /** The floating "screen" the desktop rail sits beside. */
  gutterChildren?: ReactNode;
}) {
  const {
    workspaces,
    currentWorkspace,
    collapsed,
    onToggleCollapsed,
    onExpand,
    onCreateWorkspace,
    onSwitchWorkspace,
    navItems,
    activeNavId,
    teamActions,
    items,
    groups,
    defaultGroup,
    otherTeams,
    selectedAgentId,
    onSelectAgent,
    onToggleGroupCollapsed,
    onEditGroupContext,
    onAddAgent,
    onRenameAgent,
    onDeleteAgent,
  } = model;
  const effectiveCollapsed = mobile ? false : collapsed;

  return (
    <AppSidebar
      collapsed={effectiveCollapsed}
      onToggleCollapsed={mobile ? undefined : onToggleCollapsed}
      header={
        <SidebarWorkspaceHeader
          t={t}
          workspaces={workspaces}
          currentId={currentWorkspace?.id ?? null}
          currentName={currentWorkspace?.name}
          collapsed={effectiveCollapsed}
          onSwitch={onSwitchWorkspace}
          onCreate={onCreateWorkspace}
          onExpand={onExpand}
        />
      }
      // Pending team invitations: same place in the eye (right under the
      // switcher, where a user picks a space), but their OWN full-width row —
      // the header line belongs to the switcher and the collapse toggle.
      headerBelow={
        <SidebarInviteInbox
          collapsed={effectiveCollapsed}
          onExpand={onExpand}
        />
      }
      navItems={navItems}
      activeNavId={activeNavId}
      sectionLabel={t("shell:sidebar.yourTeams")}
      sectionAction={
        teamActions.canCreateTeam ? (
          <SidebarNewTeamButton
            label={t("shell:sidebar.newTeam")}
            onClick={teamActions.createTeam}
          />
        ) : undefined
      }
      items={items}
      // The draft team (a server host between "New team" and the first typed
      // name) is a LOCAL row appended to the real ones, so it renders and
      // renames exactly like a team without existing as one.
      groups={
        teamActions.draftGroup ? [...groups, teamActions.draftGroup] : groups
      }
      defaultGroup={defaultGroup}
      // The gateway's own ceiling, counted in RUNES like the gateway counts it,
      // so the inline rename cannot compose a name the write would refuse.
      groupNameMaxRunes={TEAM_NAME_MAX_RUNES}
      renamingGroupId={teamActions.renamingGroupId}
      onRenamingGroupIdHandled={teamActions.onRenamingGroupIdHandled}
      onToggleGroupCollapsed={onToggleGroupCollapsed}
      onEditGroupContext={onEditGroupContext}
      onRenameGroup={teamActions.renameGroup}
      onDeleteGroup={teamActions.deleteGroup}
      onLeaveGroup={teamActions.leaveGroup}
      onCancelRenameGroup={teamActions.cancelRenameGroup}
      onMoveItem={teamActions.moveItem}
      // Reordering a team goes through the team actions on BOTH backends: on a
      // server host it is a `sortOrder` write, not a stored-layout one, and
      // writing the overlay there would only pretend to have moved something.
      onMoveGroup={teamActions.moveGroup}
      selectedId={selectedAgentId}
      onSelect={onSelectAgent}
      onAdd={onAddAgent}
      addItemDataAttrs={tourAnchor("newAgent")}
      onRename={onRenameAgent}
      onDelete={onDeleteAgent}
      labels={buildSidebarLabels(t)}
      footer={
        <SidebarFooter collapsed={effectiveCollapsed} otherTeams={otherTeams} />
      }
    >
      {gutterChildren}
    </AppSidebar>
  );
}
