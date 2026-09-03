import { useIsMobile } from "@houston-ai/core";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasAgentTeams } from "../../lib/org-roles";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { CreateAgentTeamDialog } from "./create-agent-team-dialog";
import { EditTeamIdentityDialog } from "./edit-team-identity-dialog";
import { SidebarDialogs } from "./sidebar-dialogs";
import { SidebarRail, type SidebarRailModel } from "./sidebar-rail";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
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
    "dashboard",
    "settings",
  ]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const agents = useAgentStore((s) => s.agents);
  const [createWsOpen, setCreateWsOpen] = useState(false);

  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  // Store-owned so the phone's Teams home (which has no rail) opens the same
  // dialog this component mounts.
  const createTeamOpen = useUIStore((s) => s.createTeamDialogOpen);
  const setCreateTeamOpen = useUIStore((s) => s.setCreateTeamDialogOpen);
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  // Folding "Your teams" is a device layout preference, persisted beside the
  // rail's own collapse so the rail comes back the way it was left.
  const teamsSectionCollapsed = useUIStore((s) => s.teamsSectionCollapsed);
  const toggleTeamsSectionCollapsed = useUIStore(
    (s) => s.toggleTeamsSectionCollapsed,
  );

  // Below md the rail is not rendered at all: the phone navigates through the
  // floating nav bar and its More menu (`mobile-nav-bar.tsx`). Selecting
  // anything that navigates still closes that menu, so the content is
  // immediately visible.
  const isMobile = useIsMobile();
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  const closeMobileMenu = () => setMobileMoreOpen(false);

  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  const sidebar = useSidebarOverlayLayout(currentWorkspace?.id, serverBacked);
  useSidebarAutoCollapse(isMobile, setSidebarCollapsed);

  const activitySummaries = useAgentActivitySummaries(agents);
  const {
    teams,
    teamActions,
    selectedAgentId,
    items,
    groups,
    defaultGroup,
    onActivateGroup,
    onActivateDefault,
  } = useSidebarTeamsModel({
    t,
    agents,
    sidebar,
    serverBacked,
    canCreateAgents,
    summaries: activitySummaries,
    closeMobileMenu,
  });
  const { navSections, activeNavId } = useSidebarNavItems(t, closeMobileMenu);
  const { switchWorkspace, selectAgent } = useSidebarNavigation({
    teams,
    closeMobileMenu,
  });

  const model: SidebarRailModel = {
    workspaces,
    currentWorkspace,
    collapsed,
    onToggleCollapsed: toggleCollapsed,
    onExpand: () => setSidebarCollapsed(false),
    onCreateWorkspace: () => setCreateWsOpen(true),
    onSwitchWorkspace: switchWorkspace,
    navSections,
    activeNavId,
    teamActions,
    items,
    groups,
    defaultGroup,
    selectedAgentId,
    onSelectAgent: selectAgent,
    onActivateGroup,
    onActivateDefault,
    sectionCollapsed: teamsSectionCollapsed,
    onToggleSectionCollapsed: toggleTeamsSectionCollapsed,
    onNewTeam: teamActions.canCreateTeam
      ? () => setCreateTeamOpen(true)
      : undefined,
    onAddAgentToTeam: canCreateAgents
      ? (teamId) => {
          setDialogOpen(true, teamId);
          closeMobileMenu();
        }
      : undefined,
    onAddAgent: canCreateAgents
      ? () => {
          setDialogOpen(true);
          closeMobileMenu();
        }
      : undefined,
  };

  /* Gutter around the floating "screen" (Arc canvas). On the desktop the small
     padding lets the window background show as a frame on all four sides; the
     screen itself is workspace-shell.tsx's rounded panel. The PHONE has no
     frame at all — one flat background edge to edge — so the padding is a
     desktop layer. */
  const gutter = (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden p-0 md:p-2">
      {children}
    </div>
  );

  return (
    <>
      <SidebarDialogs
        createWorkspaceOpen={createWsOpen}
        onCreateWorkspaceOpenChange={setCreateWsOpen}
      />
      <CreateAgentTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
        serverBacked={serverBacked}
        sidebar={sidebar}
      />
      <EditTeamIdentityDialog
        teams={teams}
        renameGroup={teamActions.renameGroup}
        setIdentity={teamActions.setIdentity}
      />
      <div className="flex h-full min-w-0 flex-1">
        {/* Phone: no rail at all, the content column takes the full width.
            Desktop: the fixed rail. */}
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
