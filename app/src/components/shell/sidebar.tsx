import {
  ConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from "@houston-ai/core";
import { AppSidebar } from "@houston-ai/layout";
import { Users } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { useTeams } from "../../hooks/use-teams";
import { resolveAutoCollapse } from "../../lib/sidebar-auto-collapse";
import {
  resolveTeamHighlight,
  sidebarSelectedAgentId,
} from "../../lib/sidebar-teams";
import {
  DEFAULT_TEAM_ID,
  teamById,
  teamOfAgent,
  visibleTeamSections,
} from "../../lib/teams-model";
import { isTopLevelView } from "../../lib/top-level-views";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { GroupContextDialog } from "./group-context-dialog";
import { SidebarInviteInbox } from "./pending-invites";
import {
  buildSidebarLabels,
  buildSidebarNavItems,
  buildTeamSectionLabels,
  SidebarWorkspaceHeader,
} from "./sidebar-chrome";
import { MobileSidebarSheet } from "./sidebar-mobile";
import { buildTeamSidebarLists } from "./team-sidebar-lists";
import { UpdateChecker } from "./update-checker";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { useSidebarAgentActions } from "./use-sidebar-agent-actions";
import { UserMenu } from "./user-menu";
import { CreateWorkspaceDialog } from "./workspace-dialog";

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
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);

  const agents = useAgentStore((s) => s.agents);
  const currentAgent = useAgentStore((s) => s.current);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  // A just-created group: the sidebar opens it straight into inline-rename.
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  // The group whose shared context is open in the editor dialog (null = closed).
  const [editingContextGroupId, setEditingContextGroupId] = useState<
    string | null
  >(null);

  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const teamSection = useUIStore((s) => s.teamSection);
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  const openSettings = useUIStore((s) => s.openSettings);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  // Teams v2: in a Teams workspace the AI Models hub is owner/admin territory
  // (org-level provider credentials + admin model policy), so plain members lose
  // its nav entry too — they pick their model per agent in the composer.
  const { showAiModels } = useSurfaceGates();
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

  const sidebar = useSidebarLayout(currentWorkspace?.id);

  // Auto-collapse the rail when the window gets narrow (e.g. Houston docked to
  // half the screen). Acts only when crossing the threshold, so a manual toggle
  // is otherwise respected; auto-expands again when it widens back across it.
  const prevWidth = useRef<number | null>(null);
  useEffect(() => {
    // Mobile has no rail to auto-collapse; the drawer is always expanded.
    if (isMobile) return;
    const apply = () => {
      const w = window.innerWidth;
      const decision = resolveAutoCollapse(prevWidth.current, w);
      if (decision !== null) setSidebarCollapsed(decision);
      prevWidth.current = w;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setSidebarCollapsed, isMobile]);

  const activitySummaries = useAgentActivitySummaries(agents);
  const { capabilities } = useCapabilities();
  const agentActions = useSidebarAgentActions({
    t,
    workspaceId: currentWorkspace?.id,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });

  // Every agent lives in exactly one team: a named sidebar group, or the
  // trailing default team, which IS the workspace (virtual — nothing about the
  // stored layout changes to make it exist). `useTeams` is the ONE resolution
  // path, shared with the team view and the workspace shell's guard, so the
  // rail can never disagree with the screen it navigates to.
  const teams = useTeams();
  // The caller-visible sections, resolved ONCE: the rows a team block offers,
  // and the section the highlight resolves against, are the same list the team
  // view itself renders from.
  const sectionIds = visibleTeamSections(capabilities);
  const highlight = resolveTeamHighlight(
    { viewMode, activeTeamId, teamSection, teamAgentFilter },
    sectionIds,
  );
  const { items, groups, defaultGroup } = buildTeamSidebarLists({
    agents,
    layout: sidebar.layout,
    teams,
    sectionIds,
    sectionLabels: buildTeamSectionLabels(t),
    highlight,
    onOpenSection: (teamId, section) => {
      openTeamView(teamId, section);
      closeMobileSidebar();
    },
    summaries: activitySummaries,
    runningLabel: (count) => t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) => t("shell:sidebar.needsYouCount", { count }),
    unreadLabel: (count) => t("shell:sidebar.unreadCount", { count }),
    onChangeColor: (agentId, color) =>
      void agentActions.changeColor(agentId, color),
    onShareAgent: (agentId) => useUIStore.getState().setShareAgentId(agentId),
    shareLabel: t("portable:exportMenu"),
  });
  const isTopLevel = isTopLevelView(viewMode);

  const handleWorkspaceSwitch = async (wsId: string) => {
    if (wsId === currentWorkspace?.id) return;
    const ws = workspaces.find((s) => s.id === wsId);
    if (!ws) return;
    closeMobileSidebar();
    setCurrentWorkspace(ws);
    await loadAgents(ws.id);
  };

  /**
   * Clicking an agent opens ITS TEAM's Mission Control, pre-filtered to that
   * agent, instead of the agent's own tab: the board is where its work lives.
   * The agent store's `current` still moves with it so the command palette and
   * ⌘[ / ⌘] cycling keep pointing at the agent the user just picked.
   */
  const handleSelectAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    openTeamView(
      teamOfAgent(teams, agentId)?.id ?? DEFAULT_TEAM_ID,
      "mission-control",
      {
        agentFilter: agent.id,
      },
    );
    closeMobileSidebar();
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    await agentActions.remove(pendingDeleteId);
    setPendingDeleteId(null);
  };

  const editingContextGroup = editingContextGroupId
    ? sidebar.layout.groups.find((g) => g.id === editingContextGroupId)
    : undefined;

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
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title={t("shell:agentDelete.title")}
        description={t("shell:agentDelete.description")}
        confirmLabel={t("common:actions.delete")}
        onConfirm={confirmDelete}
      />
      <CreateWorkspaceDialog
        open={createWsOpen}
        onOpenChange={setCreateWsOpen}
      />
      <GroupContextDialog
        open={editingContextGroup !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingContextGroupId(null);
        }}
        groupName={editingContextGroup?.name ?? ""}
        content={editingContextGroup?.context ?? ""}
        onSave={(next) => {
          if (editingContextGroupId)
            sidebar.setGroupContext(editingContextGroupId, next);
        }}
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
            {renderAppSidebar(true)}
          </MobileSidebarSheet>
        )}
        {isMobile ? gutter : renderAppSidebar(false, gutter)}
      </div>
    </>
  );

  // Shared AppSidebar invocation for both presentations. A plain function
  // (not a nested component) so switching presentation never remounts the
  // sidebar tree. Mobile is always expanded: collapse is a rail concept.
  function renderAppSidebar(mobile: boolean, gutterChildren?: ReactNode) {
    const effectiveCollapsed = mobile ? false : collapsed;
    return (
      <AppSidebar
        collapsed={effectiveCollapsed}
        onToggleCollapsed={mobile ? undefined : toggleCollapsed}
        header={
          <SidebarWorkspaceHeader
            t={t}
            workspaces={workspaces}
            currentId={currentWorkspace?.id ?? null}
            currentName={currentWorkspace?.name}
            collapsed={effectiveCollapsed}
            onSwitch={handleWorkspaceSwitch}
            onCreate={() => setCreateWsOpen(true)}
            onExpand={() => setSidebarCollapsed(false)}
          />
        }
        // Pending team invitations: same place in the eye (right under the
        // switcher, where a user picks a space), but their OWN full-width row —
        // the header line belongs to the switcher and the collapse toggle.
        headerBelow={
          <SidebarInviteInbox
            collapsed={effectiveCollapsed}
            onExpand={() => setSidebarCollapsed(false)}
          />
        }
        navItems={buildSidebarNavItems({
          t,
          showAiModels,
          setViewMode: (view) => {
            setViewMode(view);
            closeMobileSidebar();
          },
          openSettingsIndex: () => {
            openSettings(null);
            closeMobileSidebar();
          },
        })}
        activeNavId={isTopLevel ? viewMode : undefined}
        sectionLabel={t("shell:sidebar.yourTeams")}
        sectionAction={
          canCreateAgents ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("shell:sidebar.newTeam")}
                  onClick={() => {
                    const id = sidebar.createGroup(
                      t("shell:sidebar.teams.newDefault"),
                    );
                    if (id) setRenamingGroupId(id);
                  }}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                >
                  <Users className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("shell:sidebar.newTeam")}
              </TooltipContent>
            </Tooltip>
          ) : undefined
        }
        items={items}
        groups={groups}
        defaultGroup={defaultGroup}
        renamingGroupId={renamingGroupId}
        onRenamingGroupIdHandled={() => setRenamingGroupId(null)}
        onToggleGroupCollapsed={sidebar.toggleGroupCollapsed}
        onEditGroupContext={(id) => setEditingContextGroupId(id)}
        onRenameGroup={sidebar.renameGroup}
        onDeleteGroup={sidebar.deleteGroup}
        onMoveItem={sidebar.moveItem}
        onMoveGroup={sidebar.moveGroup}
        selectedId={sidebarSelectedAgentId({
          viewMode,
          highlight,
          activeTeam: teamById(teams, highlight.teamId),
          currentAgentId: currentAgent?.id ?? null,
        })}
        onSelect={handleSelectAgent}
        onAdd={
          canCreateAgents
            ? () => {
                setDialogOpen(true);
                closeMobileSidebar();
              }
            : undefined
        }
        addItemDataAttrs={{ "data-tour-target": "newAgent" }}
        onRename={agentActions.rename}
        onDelete={(agentId) => setPendingDeleteId(agentId)}
        labels={buildSidebarLabels(t)}
        footer={
          <div className="flex flex-col">
            <UserMenu collapsed={effectiveCollapsed} />
            <UpdateChecker />
          </div>
        }
      >
        {gutterChildren}
      </AppSidebar>
    );
  }
}
