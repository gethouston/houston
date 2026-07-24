import {
  ConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { AppSidebar } from "@houston-ai/layout";
import { Users } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { canSeeAiModelsPage } from "../../lib/org-roles";
import { resolveAutoCollapse } from "../../lib/sidebar-auto-collapse";
import { isTeamWorkspace } from "../../lib/space-id";
import { isTopLevelView } from "../../lib/top-level-views";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { canSeeOrganization } from "../organization";
import { buildAgentSidebarLists } from "./agent-sidebar-items";
import { GroupContextDialog } from "./group-context-dialog";
import {
  buildSidebarLabels,
  buildSidebarNavItems,
  SidebarWorkspaceHeader,
} from "./sidebar-chrome";
import { UpdateChecker } from "./update-checker";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { UserMenu } from "./user-menu";
import { CreateWorkspaceDialog } from "./workspace-dialog";

export function Sidebar({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["shell", "common", "portable", "teams"]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);

  const agents = useAgentStore((s) => s.agents);
  const currentAgent = useAgentStore((s) => s.current);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);
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
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const { capabilities } = useCapabilities();
  // Teams v2: the Organization dashboard is owner/admin-only and multiplayer-
  // only. Hidden entirely for plain members and single-player, and on a Spaces
  // host also whenever the active space is personal (non-invitable, no roster) —
  // Admin + Permissions are team-space surfaces there.
  const isTeam = currentWorkspace
    ? isTeamWorkspace(currentWorkspace.id)
    : false;
  const showOrganization = canSeeOrganization(capabilities, isTeam);
  // Teams v2: in a Teams workspace the AI Models hub is owner/admin territory
  // (org-level provider credentials + admin model policy), so plain members lose
  // its nav entry too — they pick their model per agent in the composer.
  const showAiModels = canSeeAiModelsPage(capabilities);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  const sidebar = useSidebarLayout(currentWorkspace?.id);

  // Auto-collapse the rail when the window gets narrow (e.g. Houston docked to
  // half the screen). Acts only when crossing the threshold, so a manual toggle
  // is otherwise respected; auto-expands again when it widens back across it.
  const prevWidth = useRef<number | null>(null);
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      const decision = resolveAutoCollapse(prevWidth.current, w);
      if (decision !== null) setSidebarCollapsed(decision);
      prevWidth.current = w;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setSidebarCollapsed]);

  const activitySummaries = useAgentActivitySummaries(agents);
  const { items, groups } = buildAgentSidebarLists({
    agents,
    layout: sidebar.layout,
    summaries: activitySummaries,
    runningLabel: (count) => t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) => t("shell:sidebar.needsYouCount", { count }),
    onChangeColor: (agentId, color) => void handleChangeColor(agentId, color),
    onShareAgent: (agentId) => useUIStore.getState().setShareAgentId(agentId),
    shareLabel: t("portable:exportMenu"),
  });
  const isTopLevel = isTopLevelView(viewMode);

  const handleWorkspaceSwitch = async (wsId: string) => {
    if (wsId === currentWorkspace?.id) return;
    const ws = workspaces.find((s) => s.id === wsId);
    if (!ws) return;
    setCurrentWorkspace(ws);
    await loadAgents(ws.id);
  };

  const handleSelectAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    setViewMode(DEFAULT_TAB_ID);
  };

  const handleRename = async (agentId: string, newName: string) => {
    if (!currentWorkspace) return;
    await renameAgent(currentWorkspace.id, agentId, newName);
  };

  async function handleChangeColor(agentId: string, color: string) {
    if (!currentWorkspace) return;
    await updateAgentColor(currentWorkspace.id, agentId, color);
  }

  const confirmDelete = async () => {
    if (!currentWorkspace || !pendingDeleteId) return;
    await deleteAgent(currentWorkspace.id, pendingDeleteId);
    setPendingDeleteId(null);
  };

  const editingContextGroup = editingContextGroupId
    ? sidebar.layout.groups.find((g) => g.id === editingContextGroupId)
    : undefined;

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
        <AppSidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          header={
            <SidebarWorkspaceHeader
              t={t}
              workspaces={workspaces}
              currentId={currentWorkspace?.id ?? null}
              currentName={currentWorkspace?.name}
              collapsed={collapsed}
              onSwitch={handleWorkspaceSwitch}
              onCreate={() => setCreateWsOpen(true)}
              onExpand={() => setSidebarCollapsed(false)}
            />
          }
          navItems={buildSidebarNavItems({
            t,
            showAiModels,
            showOrganization,
            setViewMode,
          })}
          activeNavId={isTopLevel ? viewMode : undefined}
          sectionLabel={t("shell:sidebar.yourAgents")}
          sectionAction={
            canCreateAgents ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("shell:sidebar.groups.new")}
                    onClick={() => {
                      const id = sidebar.createGroup(
                        t("shell:sidebar.groups.newDefault"),
                      );
                      if (id) setRenamingGroupId(id);
                    }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                  >
                    <Users className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("shell:sidebar.groups.new")}
                </TooltipContent>
              </Tooltip>
            ) : undefined
          }
          items={items}
          groups={groups}
          renamingGroupId={renamingGroupId}
          onRenamingGroupIdHandled={() => setRenamingGroupId(null)}
          onToggleGroupCollapsed={sidebar.toggleGroupCollapsed}
          onEditGroupContext={(id) => setEditingContextGroupId(id)}
          onRenameGroup={sidebar.renameGroup}
          onDeleteGroup={sidebar.deleteGroup}
          onMoveItem={sidebar.moveItem}
          onMoveGroup={sidebar.moveGroup}
          selectedId={!isTopLevel ? (currentAgent?.id ?? null) : null}
          onSelect={handleSelectAgent}
          onAdd={canCreateAgents ? () => setDialogOpen(true) : undefined}
          addItemDataAttrs={{ "data-tour-target": "newAgent" }}
          onRename={handleRename}
          onDelete={(agentId) => setPendingDeleteId(agentId)}
          labels={buildSidebarLabels(t)}
          footer={
            <div className="flex flex-col">
              <UserMenu collapsed={collapsed} />
              <UpdateChecker />
            </div>
          }
        >
          {/* Gutter around the floating "screen" (Arc canvas). The small
            padding lets the window background show as a frame on all
            four sides; the screen itself is workspace-shell.tsx's
            rounded bg-input panel. */}
          <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col p-2">
            {children}
          </div>
        </AppSidebar>
      </div>
    </>
  );
}
