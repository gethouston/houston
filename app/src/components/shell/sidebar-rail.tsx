import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
  SidebarItem,
  SidebarNavSection,
} from "@houston-ai/layout";
import { AppSidebar } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import type { Workspace } from "../../lib/types";
import { SidebarInviteInbox } from "./pending-invites";
import { buildSidebarLabels, SidebarWorkspaceHeader } from "./sidebar-chrome";
import { SidebarCreateButton } from "./sidebar-create-button";
import { SidebarFooter } from "./sidebar-footer";
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
  navSections: SidebarNavSection[];
  activeNavId: string | undefined;
  teamActions: ServerTeamActions;
  items: SidebarItem[];
  groups: SidebarGroupView[];
  defaultGroup: SidebarDefaultGroupView | undefined;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  /** A team's name was clicked. What that does is the four-arm grammar in
   *  `lib/team-header-click.ts`, executed by `use-sidebar-teams-model.ts`. */
  onActivateGroup: (id: string) => void;
  /** The DEFAULT block's name was clicked (it hands back no id). */
  onActivateDefault: () => void;
  /** Fold the whole "Your teams" list (persisted in the UI store). */
  sectionCollapsed: boolean;
  onToggleSectionCollapsed: () => void;
  /** Absent when this caller may not create teams. */
  onNewTeam: (() => void) | undefined;
  onAddAgentToTeam: ((teamId: string | null) => void) | undefined;
  /** Absent when this caller may not create agents. */
  onAddAgent: (() => void) | undefined;
  /** The band's "+": open the create sheet on its opening choice. */
  onOpenCreate: () => void;
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
  windowControlsInset = false,
  gutterChildren,
}: {
  model: SidebarRailModel;
  t: TFunction<["shell", "common", "portable", "teams", "agents"]>;
  /** Hosted in the mobile drawer (always expanded, no collapse toggle). */
  mobile: boolean;
  windowControlsInset?: boolean;
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
    navSections,
    activeNavId,
    teamActions,
    items,
    groups,
    defaultGroup,
    selectedAgentId,
    onSelectAgent,
    onActivateGroup,
    onActivateDefault,
    sectionCollapsed,
    onToggleSectionCollapsed,
    onNewTeam,
    onAddAgentToTeam,
    onAddAgent,
    onOpenCreate,
  } = model;
  const effectiveCollapsed = mobile ? false : collapsed;

  return (
    <AppSidebar
      windowControlsInset={!mobile && windowControlsInset}
      collapsed={effectiveCollapsed}
      onToggleCollapsed={mobile ? undefined : onToggleCollapsed}
      header={
        <SidebarWorkspaceHeader
          t={t}
          workspaces={workspaces}
          currentId={currentWorkspace?.id ?? null}
          currentName={currentWorkspace?.name}
          collapsed={effectiveCollapsed}
          compactTop={!mobile && (windowControlsInset || effectiveCollapsed)}
          onSwitch={onSwitchWorkspace}
          onCreate={onCreateWorkspace}
        />
      }
      // Pending team invitations: same place in the eye (right under the
      // switcher, where a user picks a space), in their own full-width row.
      headerBelow={
        <SidebarInviteInbox
          collapsed={effectiveCollapsed}
          onExpand={onExpand}
        />
      }
      navSections={navSections}
      activeNavId={activeNavId}
      sectionLabel={t("shell:sidebar.yourTeams")}
      // ONE control on the band: everything a user can ADD to this rail, behind
      // a single "+" that opens the create sheet. The sheet decides whether
      // there is a choice to make.
      sectionAction={
        <SidebarCreateButton
          labels={{
            title: t("shell:sidebar.createDialog"),
            newAgent: t("shell:sidebar.addAgent"),
            newTeam: t("shell:sidebar.newTeam"),
          }}
          canAddAgent={onAddAgent !== undefined}
          canAddTeam={onNewTeam !== undefined}
          onOpen={onOpenCreate}
        />
      }
      sectionCollapsed={sectionCollapsed}
      onToggleSectionCollapsed={onToggleSectionCollapsed}
      items={items}
      groups={groups}
      defaultGroup={defaultGroup}
      onActivateGroup={onActivateGroup}
      onActivateDefault={onActivateDefault}
      // A drag reorders an agent inside its OWN team and nothing more: moving
      // an agent between teams is a named action on the team screen.
      onMoveItem={teamActions.moveItem}
      // Reordering a team goes through the team actions on BOTH backends: on a
      // server host it is a `sortOrder` write, not a stored-layout one, and
      // writing the overlay there would only pretend to have moved something.
      onMoveGroup={teamActions.moveGroup}
      selectedId={selectedAgentId}
      onSelect={onSelectAgent}
      onAdd={onAddAgent}
      onAddToGroup={onAddAgentToTeam}
      addItemDataAttrs={tourAnchor("newAgent")}
      labels={buildSidebarLabels(t)}
      footer={<SidebarFooter collapsed={effectiveCollapsed} />}
    >
      {gutterChildren}
    </AppSidebar>
  );
}
