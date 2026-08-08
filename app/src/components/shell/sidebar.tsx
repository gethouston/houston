import { useIsMobile } from "@houston-ai/core";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasAgentTeams } from "../../lib/org-roles";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { SidebarDialogs } from "./sidebar-dialogs";
import { MobileSidebarSheet } from "./sidebar-mobile";
import { SidebarRail, type SidebarRailModel } from "./sidebar-rail";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { useSidebarAgentActions } from "./use-sidebar-agent-actions";
import { useSidebarAutoCollapse } from "./use-sidebar-auto-collapse";
import { useSidebarNavItems } from "./use-sidebar-nav-items";
import { useSidebarNavigation } from "./use-sidebar-navigation";
import { useSidebarOverlayLayout } from "./use-sidebar-overlay-layout";
import { useSidebarTeamsModel } from "./use-sidebar-teams-model";

export function Sidebar({ children }: { children: ReactNode }) {
  const { t } = useTranslation([
    "shell",
    "common",
    "portable",
    "teams",
    "agents",
  ]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const agents = useAgentStore((s) => s.agents);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  // The group whose shared context is open in the editor dialog (null = closed).
  const [editingContextGroupId, setEditingContextGroupId] = useState<
    string | null
  >(null);

  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  // Below md the fixed rail becomes a Sheet drawer (opened by MobileTopBar's
  // hamburger). Selecting anything that navigates closes the drawer so the
  // content is immediately visible.
  const isMobile = useIsMobile();
  const mobileSidebarOpen = useUIStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  const sidebar = useSidebarOverlayLayout(currentWorkspace?.id, serverBacked);
  useSidebarAutoCollapse(isMobile, setSidebarCollapsed);

  const activitySummaries = useAgentActivitySummaries(agents);
  const agentActions = useSidebarAgentActions({
    t,
    workspaceId: currentWorkspace?.id,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });
  const {
    teams,
    other,
    teamActions,
    selectedAgentId,
    items,
    groups,
    defaultGroup,
  } = useSidebarTeamsModel({
    t,
    agents,
    sidebar,
    serverBacked,
    canCreateAgents,
    summaries: activitySummaries,
    onChangeColor: (agentId, color) =>
      void agentActions.changeColor(agentId, color),
    closeMobileSidebar,
  });
  const { navItems, activeNavId } = useSidebarNavItems(t, closeMobileSidebar);
  const { switchWorkspace, selectAgent } = useSidebarNavigation({
    teams,
    closeMobileSidebar,
  });

  const model: SidebarRailModel = {
    workspaces,
    currentWorkspace,
    collapsed,
    onToggleCollapsed: toggleCollapsed,
    onExpand: () => setSidebarCollapsed(false),
    onCreateWorkspace: () => setCreateWsOpen(true),
    onSwitchWorkspace: switchWorkspace,
    navItems,
    activeNavId,
    teamActions,
    items,
    groups,
    defaultGroup,
    otherTeams: other,
    selectedAgentId,
    onSelectAgent: selectAgent,
    onToggleGroupCollapsed: sidebar.toggleGroupCollapsed,
    onEditGroupContext: setEditingContextGroupId,
    onAddAgent: canCreateAgents
      ? () => {
          setDialogOpen(true);
          closeMobileSidebar();
        }
      : undefined,
    onRenameAgent: agentActions.rename,
    onDeleteAgent: setPendingDeleteId,
  };

  /* Gutter around the floating "screen" (Arc canvas). The small padding lets
     the window background show as a frame on all four sides; the screen
     itself is workspace-shell.tsx's rounded bg-input panel. */
  const gutter = (
    <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col p-2">
      {children}
    </div>
  );

  return (
    <>
      <SidebarDialogs
        t={t}
        pendingDeleteId={pendingDeleteId}
        onPendingDeleteIdChange={setPendingDeleteId}
        onDeleteAgent={agentActions.remove}
        createWorkspaceOpen={createWsOpen}
        onCreateWorkspaceOpenChange={setCreateWsOpen}
        editingContextGroupId={editingContextGroupId}
        onEditingContextGroupIdChange={setEditingContextGroupId}
        groups={sidebar.layout.groups}
        onSaveGroupContext={sidebar.setGroupContext}
      />
      <div className="flex h-full flex-1 min-w-0">
        {/* Mobile: the same AppSidebar element, hosted in a drawer; the
            content column takes the full width. Desktop: the fixed rail. */}
        {isMobile && (
          <MobileSidebarSheet
            open={mobileSidebarOpen}
            onOpenChange={setMobileSidebarOpen}
            title={t("shell:sidebar.mobileNavTitle")}
          >
            <SidebarRail model={model} t={t} mobile />
          </MobileSidebarSheet>
        )}
        {isMobile ? (
          gutter
        ) : (
          <SidebarRail
            model={model}
            t={t}
            mobile={false}
            gutterChildren={gutter}
          />
        )}
      </div>
    </>
  );
}
