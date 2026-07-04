import {
  Button,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  type Toast,
  ToastContainer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { TabBar } from "@houston-ai/layout";
import { Compass, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_TAB_ID,
  STANDARD_TAB_IDS,
  STANDARD_TABS,
} from "../../agents/standard-tabs";
import { useActivity } from "../../hooks/queries";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { analytics } from "../../lib/analytics";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { shortcutLabel } from "../../lib/shortcuts";
import { isTopLevelView } from "../../lib/top-level-views";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { CommandPalette } from "../command-palette";
import { Dashboard } from "../dashboard";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { MissionSearchInput } from "../mission-search-input";
import { ExportAgentWizard } from "../portable/export-wizard";
import { ImportAgentWizard } from "../portable/import-wizard";
import { SettingsView } from "../settings/settings-view";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { DetailPanelProvider } from "./detail-panel-context";
import { HoustonLogo } from "./experience-card";
import { AgentRenderer } from "./experience-renderer";
import { Sidebar } from "./sidebar";
import { UiTour } from "./ui-tour";

interface WorkspaceShellProps {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}

export function WorkspaceShell({
  toasts,
  onDismissToast,
}: WorkspaceShellProps) {
  const { t } = useTranslation(["agents", "shell", "board"]);
  const currentAgent = useAgentStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const getById = useAgentCatalogStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const onStartMission = useUIStore((s) => s.onStartMission);
  const boardActions = useUIStore((s) => s.boardActions);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );
  const agentMissionSearchQuery = useUIStore((s) =>
    currentAgent
      ? (s.agentMissionSearchQueries[currentAgent.folderPath] ?? "")
      : "",
  );
  const agentMissionSearchLoading = useUIStore((s) =>
    currentAgent
      ? (s.agentMissionSearchLoading[currentAgent.folderPath] ?? false)
      : false,
  );
  const setAgentMissionSearchQuery = useUIStore(
    (s) => s.setAgentMissionSearchQuery,
  );
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const setUiTourActive = useUIStore((s) => s.setUiTourActive);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const agentDef = currentAgent ? getById(currentAgent.configId) : undefined;
  const { data: activities } = useActivity(currentAgent?.folderPath);
  const needsYouCount = (activities ?? []).filter(
    (a) => a.status === "needs_you",
  ).length;
  const isAgentView = !isTopLevelView(viewMode);
  const tabOr = (id: string) =>
    STANDARD_TAB_IDS.has(id) ? id : DEFAULT_TAB_ID;

  useEffect(() => {
    if (isAgentView && !STANDARD_TAB_IDS.has(viewMode)) {
      setViewMode(DEFAULT_TAB_ID);
    }
  }, [isAgentView, setViewMode, viewMode]);

  useEffect(() => {
    if (!currentAgent && agents.length > 0) {
      setCurrentAgent(agents[0]);
    }
  }, [agents, currentAgent, setCurrentAgent]);

  // Single tab_opened analytics point — watches viewMode regardless of which
  // path triggered the change (TabBar click, sidebar nav, keyboard shortcut,
  // programmatic redirect). Fires on real transitions only, not on initial
  // mount (the first dashboard/agent landing already shows in install_created).
  const lastTrackedViewModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastTrackedViewModeRef.current === null) {
      lastTrackedViewModeRef.current = viewMode;
      return;
    }
    if (lastTrackedViewModeRef.current === viewMode) return;
    analytics.track("tab_opened", { tab_name: viewMode });
    lastTrackedViewModeRef.current = viewMode;
  }, [viewMode]);

  useKeyboardShortcuts();

  return (
    <DetailPanelProvider value={panelContainer}>
      <div
        className={cn(
          // Transparent so the window background reads up through the content.
          // Column layout: a seamless overlay title-bar strip on top, then the
          // sidebar + content row below it.
          "flex h-screen flex-col bg-transparent text-foreground",
          uiTourActive && "pointer-events-none [&_*]:select-none",
        )}
      >
        {/* Seamless title bar (macOS titleBarStyle: Overlay). The strip is
            transparent, so it's the window-background colour in both themes —
            the traffic lights float over the app's own background with no
            separate native bar. Draggable so the window still moves by it.
            Only the macOS desktop build uses the overlay title bar, so the
            strip is gated to that — on web and other platforms it would just
            be a dead gap. */}
        {osIsTauri() && isMac && (
          <div data-tauri-drag-region className="h-7 shrink-0" />
        )}
        <div className="flex min-h-0 flex-1">
          <Sidebar>
            {/* Transparent row: the window gutter shows in the gap-2 between
              the cards (and around them). main + the mission panel are each
              their OWN rounded frosted "screen" card, so the rounding reads
              against the gutter. */}
            <div className="flex min-w-0 flex-1 overflow-hidden gap-2">
              <main
                data-tour-target="main"
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background canvas-screen"
              >
                {viewMode === "dashboard" ? (
                  <Dashboard />
                ) : viewMode === "ai-hub" ? (
                  <AiHubView />
                ) : viewMode === "settings" ? (
                  <SettingsView />
                ) : viewMode === INTEGRATIONS_VIEW_ID ? (
                  <IntegrationsView />
                ) : currentAgent && agentDef && isAgentView ? (
                  <>
                    <div data-tour-target="tabs">
                      <TabBar
                        title={currentAgent.name}
                        tabs={STANDARD_TABS.map((tab) => ({
                          id: tab.id,
                          label: t(`agents:tabLabels.${tab.id}`, {
                            defaultValue: tab.label,
                          }),
                          badge:
                            tab.badge === "activity"
                              ? needsYouCount
                              : undefined,
                        }))}
                        activeTab={viewMode}
                        onTabChange={setViewMode}
                        actions={
                          <div
                            data-keep-panel-open
                            className="flex min-w-0 flex-1 items-center justify-end gap-2"
                          >
                            {currentAgent && (
                              <MissionSearchInput
                                value={agentMissionSearchQuery}
                                isSearchingText={agentMissionSearchLoading}
                                labels={{
                                  placeholder: t("board:search.placeholder"),
                                  placeholderShort: t(
                                    "board:search.placeholderShort",
                                  ),
                                  clear: t("board:search.clear"),
                                  searchingText: t(
                                    "board:search.searchingText",
                                  ),
                                }}
                                className="relative min-w-0 flex-1 max-w-[320px]"
                                onChange={(value) => {
                                  setAgentMissionSearchQuery(
                                    currentAgent.folderPath,
                                    value,
                                  );
                                  if (viewMode !== "activity")
                                    setViewMode("activity");
                                }}
                              />
                            )}
                            <div className="flex shrink-0 items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    data-tour-target="appTour"
                                    variant="ghost"
                                    size={missionPanelOpen ? "icon" : "default"}
                                    className="rounded-full"
                                    onClick={() => setUiTourActive(true)}
                                    aria-label={t("shell:tabActions.startTour")}
                                  >
                                    <Compass className="size-4" />
                                    {!missionPanelOpen &&
                                      t("shell:tabActions.startTour")}
                                  </Button>
                                </TooltipTrigger>
                                {missionPanelOpen && (
                                  <TooltipContent side="bottom">
                                    {t("shell:tabActions.startTour")}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                              {onStartMission && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      data-tour-target="newMission"
                                      size={
                                        missionPanelOpen ? "icon" : "default"
                                      }
                                      className={cn(
                                        missionPanelOpen && "rounded-full",
                                      )}
                                      onClick={() => {
                                        setViewMode("activity");
                                        setTimeout(() => {
                                          useUIStore
                                            .getState()
                                            .onStartMission?.();
                                        }, 50);
                                      }}
                                      aria-label={t(
                                        "shell:tabActions.newMission",
                                      )}
                                    >
                                      <HoustonLogo size={16} />
                                      {!missionPanelOpen &&
                                        t("shell:tabActions.newMission")}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    {missionPanelOpen
                                      ? t("shell:tabActions.newMission")
                                      : shortcutLabel("newMission")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {boardActions.map((action) => (
                                <Button
                                  key={action.id}
                                  variant="secondary"
                                  onClick={() => {
                                    setViewMode("activity");
                                    setTimeout(() => action.onClick(), 50);
                                  }}
                                >
                                  {action.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        }
                      />
                    </div>
                    <main className="min-h-0 flex-1 overflow-hidden">
                      <AgentRenderer
                        agentDef={agentDef}
                        agent={currentAgent}
                        activeTabId={viewMode}
                      />
                    </main>
                  </>
                ) : agents.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>{t("agents:empty.title")}</EmptyTitle>
                        <EmptyDescription>
                          {t("agents:empty.description")}
                        </EmptyDescription>
                      </EmptyHeader>
                      {canCreateAgents && (
                        <Button
                          className="mt-4 rounded-full"
                          onClick={() => setCreateAgentDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                          {t("shell:newAgent.dialogTitle")}
                        </Button>
                      )}
                    </Empty>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <p className="text-muted-foreground text-sm">
                      {t("shell:engineGate.starting")}
                    </p>
                  </div>
                )}
              </main>
              {missionPanelOpen && (
                <div
                  ref={setPanelContainer}
                  className="h-full overflow-hidden rounded-2xl bg-background canvas-screen"
                  style={{ width: "45%", minWidth: 380 }}
                />
              )}
            </div>
          </Sidebar>
        </div>
        <CreateAgentDialog />
        <ExportAgentWizard />
        <ImportAgentWizard />
        <CommandPalette />
        <ShortcutCheatsheet />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </div>
      {uiTourActive && (
        <UiTour
          steps={[
            {
              title: t("shell:uiTour.steps.assistant.title"),
              body: t("shell:uiTour.steps.assistant.body"),
              targetSelector: "[data-tour-target='agents']",
              onEnter: () => setViewMode(DEFAULT_TAB_ID),
            },
            {
              title: t("shell:uiTour.steps.board.title"),
              body: t("shell:uiTour.steps.board.body"),
              targetSelector: "[data-tour-target='main']",
              onEnter: () => setViewMode(DEFAULT_TAB_ID),
            },
            {
              title: t("shell:uiTour.steps.newMission.title"),
              body: t("shell:uiTour.steps.newMission.body"),
              targetSelector: "[data-tour-target='newMission']",
              onEnter: () => setViewMode(DEFAULT_TAB_ID),
            },
            {
              title: t("shell:uiTour.steps.tabActivity.title"),
              body: t("shell:uiTour.steps.tabActivity.body"),
              targetSelector: "[data-tour-target='tab-activity']",
              onEnter: () => setViewMode(tabOr("activity")),
            },
            {
              title: t("shell:uiTour.steps.tabRoutines.title"),
              body: t("shell:uiTour.steps.tabRoutines.body"),
              targetSelector: "[data-tour-target='tab-routines']",
              onEnter: () => setViewMode(tabOr("routines")),
            },
            {
              title: t("shell:uiTour.steps.tabFiles.title"),
              body: t("shell:uiTour.steps.tabFiles.body"),
              targetSelector: "[data-tour-target='tab-files']",
              onEnter: () => setViewMode(tabOr("files")),
            },
            {
              title: t("shell:uiTour.steps.tabJobDescription.title"),
              body: t("shell:uiTour.steps.tabJobDescription.body"),
              targetSelector: "[data-tour-target='tab-job-description']",
              onEnter: () => setViewMode(tabOr("job-description")),
            },
            {
              title: t("shell:uiTour.steps.missionControl.title"),
              body: t("shell:uiTour.steps.missionControl.body"),
              targetSelector: "[data-tour-target='nav-dashboard']",
              onEnter: () => setViewMode("dashboard"),
            },
            {
              title: t("shell:uiTour.steps.appTour.title"),
              body: t("shell:uiTour.steps.appTour.body"),
              targetSelector: "[data-tour-target='appTour']",
              onEnter: () => {
                setCreateAgentDialogOpen(false);
                setViewMode(DEFAULT_TAB_ID);
              },
            },
            {
              title: t("shell:uiTour.steps.newAgent.title"),
              body: t("shell:uiTour.steps.newAgent.body"),
              targetSelector: "[data-tour-target='newAgent']",
              onEnter: () => {
                setCreateAgentDialogOpen(false);
                setViewMode(DEFAULT_TAB_ID);
              },
            },
            {
              title: t("shell:uiTour.steps.agentStore.title"),
              body: t("shell:uiTour.steps.agentStore.body"),
              targetSelector: "[data-tour-target='agentStore']",
              spotlightPadding: 4,
              placement: "viewport-right",
              onEnter: () => setCreateAgentDialogOpen(true),
            },
            {
              title: t("shell:uiTour.steps.outro.title"),
              body: t("shell:uiTour.steps.outro.body"),
              confirmLabel: t("shell:uiTour.steps.outro.confirm"),
              onEnter: () => setCreateAgentDialogOpen(false),
            },
          ]}
          onDismiss={() => {
            setUiTourActive(false);
            setCreateAgentDialogOpen(false);
          }}
        />
      )}
    </DetailPanelProvider>
  );
}
