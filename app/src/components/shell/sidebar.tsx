import { useIsMobile } from "@houston-ai/core";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanAddAgentsHere } from "../../hooks/use-can-create-agents";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useWindowControlsInset } from "../../hooks/use-window-controls-inset";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { SidebarDialogs } from "./sidebar-dialogs";
import { useSidebarManagerRow } from "./sidebar-manager-row";
import { SidebarRail, type SidebarRailModel } from "./sidebar-rail";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { useSidebarAutoCollapse } from "./use-sidebar-auto-collapse";
import { useSidebarNavigation } from "./use-sidebar-navigation";
import { useSidebarTeamsModel } from "./use-sidebar-teams-model";

export function Sidebar({ children }: { children: ReactNode }) {
  const { t } = useTranslation([
    "shell",
    "common",
    "portable",
    "teams",
    "agents",
  ]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const agents = useAgentStore((s) => s.agents);
  const [createWsOpen, setCreateWsOpen] = useState(false);

  // Store-owned so every other door into the create sheet (the phone's AI
  // Employees list, a team's empty board) opens the one the shell mounts.
  const openCreateFlow = useUIStore((s) => s.openCreateFlow);
  const canCreateAgents = useCanAddAgentsHere();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  // Below md the rail is not rendered at all: the phone navigates through the
  // floating nav bar and its More menu (`mobile-nav-bar.tsx`). Selecting
  // anything that navigates still closes that menu, so the content is
  // immediately visible.
  const isMobile = useIsMobile();
  const windowControlsInset = useWindowControlsInset();
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  const closeMobileMenu = () => setMobileMoreOpen(false);

  const sidebar = useSidebarLayout(currentWorkspace?.id);
  useSidebarAutoCollapse(isMobile, setSidebarCollapsed);

  const activitySummaries = useAgentActivitySummaries(agents);
  const { selectedAgentId, items, groups, onActivateGroup } =
    useSidebarTeamsModel({
      t,
      agents,
      sidebar,
      summaries: activitySummaries,
    });
  const { selectAgent } = useSidebarNavigation({
    closeMobileMenu,
  });
  const manager = useSidebarManagerRow({
    t,
    selectedAgentId,
    selectAgent,
    closeMobileMenu,
  });

  const model: SidebarRailModel = {
    collapsed,
    onToggleCollapsed: toggleCollapsed,
    onExpand: () => setSidebarCollapsed(false),
    onCreateWorkspace: () => setCreateWsOpen(true),
    onArrange: sidebar.arrange,
    ready: sidebar.ready,
    items,
    pinnedItems: manager.pinnedItems,
    groups,
    order: sidebar.layout.order,
    selectedAgentId: manager.selectedId,
    onSelectAgent: manager.onSelect,
    onActivateGroup,
    onNewTeam: () => openCreateFlow("team"),
    onAddAgent: canCreateAgents
      ? () => {
          openCreateFlow("agent");
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
    <div
      data-tauri-drag-region={osIsTauri() && isMac ? true : undefined}
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden p-0 md:p-2"
    >
      {children}
    </div>
  );

  return (
    <>
      <SidebarDialogs
        createWorkspaceOpen={createWsOpen}
        onCreateWorkspaceOpenChange={setCreateWsOpen}
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
            windowControlsInset={windowControlsInset}
            gutterChildren={gutter}
          />
        )}
      </div>
    </>
  );
}
