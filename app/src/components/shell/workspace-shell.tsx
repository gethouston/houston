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
  agentTabFallback,
  DEFAULT_TAB_ID,
  isVisibleAgentTab,
  STANDARD_TAB_IDS,
  visibleAgentTabs,
} from "../../agents/standard-tabs";
import { useActivity } from "../../hooks/queries";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { analytics } from "../../lib/analytics";
import {
  canSeeAiModelsPage,
  canSeeIntegrationsPage,
  hasSpaces,
} from "../../lib/org-roles";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { isRoutineSetupMode } from "../../lib/routine-chat-setup";
import { shortcutLabel } from "../../lib/shortcuts";
import { blockedTopLevelView, isTopLevelView } from "../../lib/top-level-views";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPersonScopeProvider } from "../agent-person-scope-context";
import { AgentPersonScopeMenu } from "../agent-person-scope-menu";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { CommandPalette } from "../command-palette";
import { Dashboard } from "../dashboard";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { MissionSearchInput } from "../mission-search-input";
import {
  canSeeOrganization,
  ORGANIZATION_VIEW_ID,
  OrganizationView,
} from "../organization";
import { ExportAgentWizard } from "../portable/export-wizard";
import { ImportAgentWizard } from "../portable/import-wizard";
import { SettingsView } from "../settings/settings-view";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { AgentShareButton } from "../tabs/agent-share-button";
import { AgentWarmingDialog } from "./agent-warming-dialog";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { DetailPanelProvider } from "./detail-panel-context";
import { HoustonLogo } from "./experience-card";
import { AgentRenderer } from "./experience-renderer";
import { Sidebar } from "./sidebar";
import { TeamStatusBanner } from "./team-status-banner";
import { UiTour, type UiTourStep } from "./ui-tour";

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
  const { capabilities } = useCapabilities();
  // Teams v2: guard the Organization render so a stale `viewMode` can never show
  // it to a plain member / single-player (the sidebar already hides the entry).
  const showOrganization = canSeeOrganization(capabilities);
  // Teams v2: guard the Integrations render + tour anchor so a stale `viewMode`
  // can never show the page to a plain member (the sidebar already hides it).
  const showIntegrations = canSeeIntegrationsPage(capabilities);
  // Teams v2: same guard for the AI Models hub — owner/admin only in a Teams
  // workspace (org-level providers + admin model policy).
  const showAiModels = canSeeAiModelsPage(capabilities);
  const agentDef = currentAgent ? getById(currentAgent.configId) : undefined;
  const { data: activities } = useActivity(currentAgent?.folderPath);
  const needsYouCount = (activities ?? []).filter(
    (a) => a.status === "needs_you" && !isRoutineSetupMode(a.agent),
  ).length;
  const isAgentView = !isTopLevelView(viewMode);
  // Resolve against the CALLER-visible tab set, not the raw standard ids:
  // `job-description` (Agent Settings) is a standard id but hidden from plain
  // members, so a STANDARD_TAB_IDS check would let a member's viewMode land on
  // it and strand them on a blank pane (AgentRenderer marks no visible tab
  // active). With no current agent the standard set is the only thing we can
  // check, and the empty state renders regardless.
  const tabOr = (id: string) =>
    currentAgent
      ? agentTabFallback(capabilities, currentAgent, id)
      : STANDARD_TAB_IDS.has(id)
        ? id
        : DEFAULT_TAB_ID;

  useEffect(() => {
    if (!isAgentView) {
      // A gated top-level view (Integrations for a plain Teams member,
      // Organization for a member / single-player) with a stale `viewMode`
      // would fall through every render branch and strand the user on the
      // engine pane with its nav entry hidden; reset to the dashboard.
      if (
        blockedTopLevelView(viewMode, {
          showIntegrations,
          showAiModels,
          showOrganization,
        })
      ) {
        setViewMode("dashboard");
      }
      return;
    }
    const valid = currentAgent
      ? isVisibleAgentTab(capabilities, currentAgent, viewMode)
      : STANDARD_TAB_IDS.has(viewMode);
    if (!valid) setViewMode(DEFAULT_TAB_ID);
  }, [
    capabilities,
    currentAgent,
    isAgentView,
    setViewMode,
    showIntegrations,
    showAiModels,
    showOrganization,
    viewMode,
  ]);

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
                <TeamStatusBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {viewMode === "dashboard" ? (
                    <Dashboard />
                  ) : viewMode === "ai-hub" && showAiModels ? (
                    <AiHubView />
                  ) : viewMode === "settings" ? (
                    <SettingsView />
                  ) : viewMode === INTEGRATIONS_VIEW_ID && showIntegrations ? (
                    <IntegrationsView />
                  ) : viewMode === ORGANIZATION_VIEW_ID && showOrganization ? (
                    <OrganizationView />
                  ) : currentAgent && agentDef && isAgentView ? (
                    <AgentPersonScopeProvider path={currentAgent.folderPath}>
                      <div data-tour-target="tabs">
                        <TabBar
                          title={currentAgent.name}
                          tabs={visibleAgentTabs(
                            capabilities,
                            currentAgent,
                          ).map((tab) => ({
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
                                <AgentPersonScopeMenu
                                  agent={currentAgent}
                                  collapsed={missionPanelOpen}
                                />
                                <AgentShareButton
                                  agent={currentAgent}
                                  collapsed={missionPanelOpen}
                                />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      data-tour-target="appTour"
                                      variant="ghost"
                                      size={
                                        missionPanelOpen ? "icon" : "default"
                                      }
                                      className="rounded-full"
                                      onClick={() => setUiTourActive(true)}
                                      aria-label={t(
                                        "shell:tabActions.startTour",
                                      )}
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
                    </AgentPersonScopeProvider>
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
                </div>
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
        <AgentWarmingDialog />
        <ExportAgentWizard />
        <ImportAgentWizard />
        <CommandPalette />
        <ShortcutCheatsheet />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </div>
      {uiTourActive && (
        <UiTour
          steps={(
            [
              // Spaces hosts only (dropped by the filter below): open on the
              // switcher so people learn a Space holds their personal agents and
              // the teams they share with others.
              {
                title: t("shell:uiTour.steps.spaces.title"),
                body: t("shell:uiTour.steps.spaces.body"),
                targetSelector: "[data-tour-target='spaceSwitcher']",
                onEnter: () => setViewMode(DEFAULT_TAB_ID),
              },
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
                title: t("shell:uiTour.steps.tabIntegrations.title"),
                body: t("shell:uiTour.steps.tabIntegrations.body"),
                targetSelector: "[data-tour-target='tab-integrations']",
                onEnter: () => setViewMode(tabOr("integrations")),
              },
              {
                title: t("shell:uiTour.steps.tabFiles.title"),
                body: t("shell:uiTour.steps.tabFiles.body"),
                targetSelector: "[data-tour-target='tab-files']",
                onEnter: () => setViewMode(tabOr("files")),
              },
              {
                title: t("shell:uiTour.steps.tabArchived.title"),
                body: t("shell:uiTour.steps.tabArchived.body"),
                targetSelector: "[data-tour-target='tab-archived']",
                onEnter: () => setViewMode(tabOr("archived")),
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
                title: t("shell:uiTour.steps.navIntegrations.title"),
                body: t("shell:uiTour.steps.navIntegrations.body"),
                targetSelector: "[data-tour-target='nav-integrations']",
                onEnter: () => setViewMode(INTEGRATIONS_VIEW_ID),
              },
              {
                title: t("shell:uiTour.steps.aiHub.title"),
                body: t("shell:uiTour.steps.aiHub.body"),
                targetSelector: "[data-tour-target='nav-ai-hub']",
                onEnter: () => setViewMode("ai-hub"),
              },
              {
                title: t("shell:uiTour.steps.organization.title"),
                body: t("shell:uiTour.steps.organization.body"),
                targetSelector: "[data-tour-target='nav-organization']",
                onEnter: () => setViewMode(ORGANIZATION_VIEW_ID),
              },
              {
                title: t("shell:uiTour.steps.settings.title"),
                body: t("shell:uiTour.steps.settings.body"),
                targetSelector: "[data-tour-target='nav-settings']",
                onEnter: () => setViewMode("settings"),
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
              // The "replay the tour" step is a wrap-up pointer at the replay
              // button, so it comes last, right before the outro. It closes the
              // create-agent dialog opened by the agentStore step above.
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
                title: t("shell:uiTour.steps.outro.title"),
                body: t("shell:uiTour.steps.outro.body"),
                confirmLabel: t("shell:uiTour.steps.outro.confirm"),
                onEnter: () => setCreateAgentDialogOpen(false),
              },
            ] satisfies UiTourStep[]
          ).filter((step) => {
            // The space-switcher step only makes sense on a spaces host; off
            // spaces there is no team to switch to, so drop its spotlight.
            if (step.targetSelector === "[data-tour-target='spaceSwitcher']") {
              return hasSpaces(capabilities);
            }
            // The Agent Settings (job-description) step targets a tab plain
            // members never see. Drop it for them so the tour never
            // highlights a missing anchor or leaves them on a blank pane.
            if (
              step.targetSelector === "[data-tour-target='tab-job-description']"
            ) {
              return (
                !!currentAgent &&
                isVisibleAgentTab(capabilities, currentAgent, "job-description")
              );
            }
            // The Organization nav item only renders for multiplayer
            // workspaces — same reasoning, drop the step where the anchor
            // never exists.
            if (
              step.targetSelector === "[data-tour-target='nav-organization']"
            ) {
              return showOrganization;
            }
            // The Integrations nav item is hidden from plain Teams members, so
            // drop its tour step where the anchor never renders.
            if (
              step.targetSelector === "[data-tour-target='nav-integrations']"
            ) {
              return showIntegrations;
            }
            // The AI Models hub is hidden from plain Teams members too — drop its
            // tour step where the anchor never renders.
            if (step.targetSelector === "[data-tour-target='nav-ai-hub']") {
              return showAiModels;
            }
            return true;
          })}
          onDismiss={() => {
            setUiTourActive(false);
            setCreateAgentDialogOpen(false);
          }}
        />
      )}
    </DetailPanelProvider>
  );
}
