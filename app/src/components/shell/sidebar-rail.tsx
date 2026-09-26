import type {
  SidebarArrangement,
  SidebarGroupView,
  SidebarItem,
  SidebarNavSection,
  SidebarRootEntry,
} from "@houston-ai/layout";
import { AppSidebar } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import type { Workspace } from "../../lib/types";
import { SidebarInviteInbox } from "./pending-invites";
import { buildSidebarLabels, SidebarWorkspaceHeader } from "./sidebar-chrome";
import { SidebarCreateButton } from "./sidebar-create-button";
import { SidebarFooter } from "./sidebar-footer";
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
  /** Stores a drop: the whole arrangement the rail now shows. False when
   *  nothing was written, so the rail keeps the stored order. */
  onArrange: (arrangement: SidebarArrangement) => boolean;
  ready: boolean;
  items: SidebarItem[];
  groups: SidebarGroupView[];
  order: SidebarRootEntry[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  /** Fold or unfold a folder from its heading. */
  onActivateGroup: (id: string) => void;
  /** Fold the AI Employees section (persisted in the UI store). */
  sectionCollapsed: boolean;
  onToggleSectionCollapsed: () => void;
  /** Opens the create sheet on a new folder; the rail withholds it until the
   *  layout read succeeds. */
  onNewTeam: () => void;
  /** Absent when this caller may not create agents. */
  onAddAgent: (() => void) | undefined;
}

/**
 * The rail itself: one `AppSidebar` invocation, fed entirely by the view model
 * `Sidebar` composed. The phone does not render this rail: it manages
 * employees and groups from the AI Employees list.
 *
 * A component and not a closure inside `Sidebar` because that file was over the
 * 200-line limit and this is the cohesive half: everything here is "what the
 * rail LOOKS like", everything left there is "what the rail knows".
 */
export function SidebarRail({
  model,
  t,
  windowControlsInset = false,
  gutterChildren,
}: {
  model: SidebarRailModel;
  t: TFunction<["shell", "common", "portable", "teams", "agents"]>;
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
    onArrange,
    ready,
    items,
    groups,
    order,
    selectedAgentId,
    onSelectAgent,
    onActivateGroup,
    sectionCollapsed,
    onToggleSectionCollapsed,
    onNewTeam,
    onAddAgent,
  } = model;

  return (
    <AppSidebar
      windowControlsInset={windowControlsInset}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      header={
        <SidebarWorkspaceHeader
          t={t}
          workspaces={workspaces}
          currentId={currentWorkspace?.id ?? null}
          currentName={currentWorkspace?.name}
          collapsed={collapsed}
          compactTop={windowControlsInset || collapsed}
          onSwitch={onSwitchWorkspace}
          onCreate={onCreateWorkspace}
        />
      }
      // Pending team invitations: same place in the eye (right under the
      // switcher, where a user picks a space), in their own full-width row.
      headerBelow={
        <SidebarInviteInbox collapsed={collapsed} onExpand={onExpand} />
      }
      navSections={navSections}
      activeNavId={activeNavId}
      sectionLabel={t("shell:sidebar.employeesSection")}
      // The band's single add control offers the available creation forms.
      sectionAction={
        <SidebarCreateButton
          labels={{
            title: t("shell:sidebar.createDialog"),
            newAgent: t("shell:sidebar.addAgent"),
            newTeam: t("shell:sidebar.newTeam"),
          }}
          onNewAgent={onAddAgent}
          onNewTeam={ready ? onNewTeam : undefined}
        />
      }
      sectionCollapsed={sectionCollapsed}
      onToggleSectionCollapsed={onToggleSectionCollapsed}
      items={items}
      groups={groups}
      order={order}
      onActivateGroup={ready ? onActivateGroup : undefined}
      onArrange={ready ? onArrange : undefined}
      selectedId={selectedAgentId}
      onSelect={onSelectAgent}
      onAdd={onAddAgent}
      addItemDataAttrs={tourAnchor("newAgent")}
      labels={buildSidebarLabels(t)}
      footer={<SidebarFooter collapsed={collapsed} />}
    >
      {gutterChildren}
    </AppSidebar>
  );
}
