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
  useIsMobile,
} from "@houston-ai/core";
import { TabBar } from "@houston-ai/layout";
import { Plus } from "lucide-react";
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
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { analytics } from "../../lib/analytics";
import { isSetupChatMode } from "../../lib/integration-chat-setup";
import { hasSpaces } from "../../lib/org-roles";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { shortcutLabel } from "../../lib/shortcuts";
import { blockedTopLevelView, isTopLevelView } from "../../lib/top-level-views";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentPersonScopeProvider } from "../agent-person-scope-context";
import { AgentPersonScopeMenu } from "../agent-person-scope-menu";
import { CommandPalette } from "../command-palette";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view";
import { MissionSearchInput } from "../mission-search-input";
import { ExportAgentWizard } from "../portable/export-wizard";
import { ImportAgentWizard } from "../portable/import-wizard";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { STORE_VIEW_ID } from "../store-view";
import { AgentWarmingDialog } from "./agent-warming-dialog";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { DetailPanelProvider } from "./detail-panel-context";
import { HoustonLogo } from "./experience-card";
import { AgentRenderer } from "./experience-renderer";
import { KeepAliveViews } from "./keep-alive-views";
import { MobileTopBar } from "./mobile-top-bar";
import { NotificationsBell } from "./notifications-bell";
import { Sidebar } from "./sidebar";
import { TeamStatusBanner } from "./team-status-banner";
import { topLevelScreenViews } from "./top-level-screen-views";
import { UiTour, type UiTourStep } from "./ui-tour";

interface WorkspaceShellProps {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}

export function WorkspaceShell({
  toasts,
  onDismissToast,
}: WorkspaceShellProps) {
  const { t } = useTranslation(["agents", "dashboard", "shell", "board"]);
  const currentAgent = useAgentStore((s) => s.current);
  const currentAgentId = currentAgent?.id;
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const getById = useAgentCatalogStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const agentBoardMode = useUIStore((s) => s.agentBoardMode);
  const setAgentBoardMode = useUIStore((s) => s.setAgentBoardMode);
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
  // Teams v2: `showAiModels` guards the AI Models hub render so a stale
  // `viewMode` can never show it to a plain member (the sidebar already hides
  // the entry) — the hub is owner/admin only in a Teams workspace (org-level
  // providers + admin model policy). `showOrganization` picks the Settings tour
  // copy: only a caller who HAS a team sees the Team card inside Settings.
  const { showAiModels, showOrganization } = useSurfaceGates();
  // Keying the kept-alive set by workspace drops every cached screen when the
  // user switches workspace/space: their contents are workspace-scoped.
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const agentDef = currentAgent ? getById(currentAgent.configId) : undefined;
  const { data: activities } = useActivity(currentAgent?.folderPath);
  const needsYouCount = (activities ?? []).filter(
    (a) => a.status === "needs_you" && !isSetupChatMode(a.agent),
  ).length;
  const isAgentView = !isTopLevelView(viewMode);
  // Resolve against the CALLER-visible tab set, not the raw standard ids:
  // `context` / `skills` / `admin` are standard ids but hidden from plain
  // members, so a STANDARD_TAB_IDS check would let a member's viewMode land on
  // one and strand them on a blank pane (AgentRenderer marks no visible tab
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
      // A gated top-level view (the AI Models hub for a plain member) with a
      // stale `viewMode` would fall through every render branch and strand the
      // user on the engine pane with its nav entry hidden; reset to the
      // dashboard.
      if (blockedTopLevelView(viewMode, { showAiModels })) {
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
    showAiModels,
    viewMode,
  ]);

  useEffect(() => {
    if (!currentAgent && agents.length > 0) {
      setCurrentAgent(agents[0]);
    }
  }, [agents, currentAgent, setCurrentAgent]);

  const previousAgentIdRef = useRef(currentAgentId);
  useEffect(() => {
    if (previousAgentIdRef.current === currentAgentId) return;
    previousAgentIdRef.current = currentAgentId;
    setAgentBoardMode("active");
  }, [currentAgentId, setAgentBoardMode]);

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
    lastTrackedViewModeRef.current = viewMode;
    // Settings emits its OWN event (`settings` for the index, `settings:<id>`
    // for a section) once the surface really renders. Emitting here too would
    // double-count every deep link and would fire while a gate still shows a
    // spinner, so the one view that owns its event is skipped.
    if (viewMode === "settings") return;
    analytics.track("tab_opened", { tab_name: viewMode });
  }, [viewMode]);

  useKeyboardShortcuts();

  // Mobile (<768px): tab-bar actions drop to icon size (same treatment the
  // open mission panel already forces) and the mission panel covers the full
  // content area instead of splitting it 55/45.
  const isMobile = useIsMobile();
  const compactActions = missionPanelOpen || isMobile;

  return (
    <DetailPanelProvider value={panelContainer}>
      <div
        className={cn(
          // Transparent so the window background reads up through the content.
          // Column layout: a seamless overlay title-bar strip on top, then the
          // sidebar + content row below it.
          // h-dvh (not h-screen) so mobile browser chrome (the collapsing URL
          // bar) never pushes the composer below the visible viewport.
          "flex h-dvh flex-col bg-transparent text-ink",
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
            {/* Hamburger row for the mobile drawer; CSS-hidden at md+. */}
            <MobileTopBar />
            {/* Transparent row: the window gutter shows in the gap-2 between
              the cards (and around them). main + the mission panel are each
              their OWN rounded frosted "screen" card, so the rounding reads
              against the gutter. `relative` anchors the mobile full-screen
              mission panel overlay. */}
            <div className="relative flex min-w-0 flex-1 overflow-hidden gap-2">
              <main
                data-tour-target="main"
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background canvas-screen"
              >
                <TeamStatusBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <KeepAliveViews
                    key={currentWorkspace?.id ?? "no-workspace"}
                    activeId={viewMode}
                    views={topLevelScreenViews({ showAiModels })}
                  />
                  {isAgentView &&
                    (currentAgent && agentDef ? (
                      <AgentPersonScopeProvider
                        key={currentAgent.id}
                        path={currentAgent.folderPath}
                      >
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
                              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                                {/* Hidden in the archive: this field searches
                                    the ACTIVE board, so leaving it up beside
                                    the archive's own search gave the user two
                                    boxes, one of which did nothing visible
                                    (HOU-1043). */}
                                {currentAgent &&
                                  agentBoardMode !== "archived" && (
                                    <MissionSearchInput
                                      value={agentMissionSearchQuery}
                                      isSearchingText={
                                        agentMissionSearchLoading
                                      }
                                      labels={{
                                        placeholder: t(
                                          "board:search.placeholder",
                                        ),
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
                                    collapsed={compactActions}
                                  />
                                  <NotificationsBell />
                                  {onStartMission && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          data-tour-target="newMission"
                                          size={
                                            compactActions ? "icon" : "default"
                                          }
                                          className={cn(
                                            compactActions && "rounded-full",
                                          )}
                                          onClick={() => {
                                            setViewMode("activity");
                                            setAgentBoardMode("active");
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
                                          {!compactActions &&
                                            t("shell:tabActions.newMission")}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        {compactActions
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
                                        setAgentBoardMode("active");
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
                        <p className="text-ink-muted text-sm">
                          {t("shell:engineGate.starting")}
                        </p>
                      </div>
                    ))}
                </div>
              </main>
              {missionPanelOpen && (
                <div
                  ref={setPanelContainer}
                  data-testid="mission-panel"
                  className={cn(
                    "h-full overflow-hidden rounded-2xl bg-background canvas-screen",
                    // Mobile: the panel takes the whole content area (the
                    // board stays mounted underneath); its own close button
                    // returns to the board.
                    isMobile && "absolute inset-0 z-30 w-full",
                  )}
                  style={isMobile ? undefined : { width: "45%", minWidth: 380 }}
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
                title: t("shell:uiTour.steps.tabArchived.title"),
                body: t("shell:uiTour.steps.tabArchived.body"),
                targetSelector: "[data-tour-target='archivedMissions']",
                onEnter: () => {
                  setViewMode(tabOr("activity"));
                  setAgentBoardMode("active");
                },
              },
              {
                title: t("shell:uiTour.steps.tabContext.title"),
                body: t("shell:uiTour.steps.tabContext.body"),
                targetSelector: "[data-tour-target='tab-context']",
                onEnter: () => setViewMode(tabOr("context")),
              },
              {
                title: t("shell:uiTour.steps.tabSkills.title"),
                body: t("shell:uiTour.steps.tabSkills.body"),
                targetSelector: "[data-tour-target='tab-skills']",
                onEnter: () => setViewMode(tabOr("skills")),
              },
              {
                title: t("shell:uiTour.steps.tabIntegrations.title"),
                body: t("shell:uiTour.steps.tabIntegrations.body"),
                targetSelector: "[data-tour-target='tab-integrations']",
                onEnter: () => setViewMode(tabOr("integrations")),
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
              // Usage, Permissions and Admin have no sidebar anchor to spotlight
              // since HOU-788 — they are sections inside Settings, which the
              // next step covers. It only PROMISES them to a caller whose org
              // gate is on: single-player and plain members see no Team card,
              // so their copy stops at the personal settings.
              {
                title: t("shell:uiTour.steps.settings.title"),
                body: showOrganization
                  ? t("shell:uiTour.steps.settings.bodyTeam")
                  : t("shell:uiTour.steps.settings.body"),
                targetSelector: "[data-tour-target='nav-settings']",
                onEnter: () => useUIStore.getState().openSettings(null),
              },
              {
                title: t("shell:uiTour.steps.newAgent.title"),
                body: t("shell:uiTour.steps.newAgent.body"),
                targetSelector: "[data-tour-target='newAgent']",
                onEnter: () => setViewMode(DEFAULT_TAB_ID),
              },
              {
                title: t("shell:uiTour.steps.agentStore.title"),
                body: t("shell:uiTour.steps.agentStore.body"),
                targetSelector: "[data-tour-target='nav-agent-store']",
                onEnter: () => setViewMode(STORE_VIEW_ID),
              },
              // The "replay the tour" step is a wrap-up pointer at the replay
              // button, so it comes last, right before the outro. The replay
              // entry point is the Settings > Help row, so the step opens
              // Settings for its anchor to exist.
              {
                title: t("shell:uiTour.steps.appTour.title"),
                body: t("shell:uiTour.steps.appTour.body"),
                targetSelector: "[data-tour-target='appTour']",
                onEnter: () => useUIStore.getState().openSettings(null),
              },
              {
                title: t("shell:uiTour.steps.outro.title"),
                body: t("shell:uiTour.steps.outro.body"),
                confirmLabel: t("shell:uiTour.steps.outro.confirm"),
              },
            ] satisfies UiTourStep[]
          ).filter((step) => {
            // The space-switcher step only makes sense on a spaces host; off
            // spaces there is no team to switch to, so drop its spotlight.
            if (step.targetSelector === "[data-tour-target='spaceSwitcher']") {
              return hasSpaces(capabilities);
            }
            // The Context and Skills steps target tabs some callers never see
            // (Context is hidden from non-Teams members, Skills is
            // manager-only). Drop them so the tour never highlights a missing
            // anchor or leaves the user on a blank pane. The Admin tab gets no
            // tour step: it is a manager surface, not part of the everyday
            // loop the tour teaches.
            const gatedTab = ["context", "skills"].find(
              (id) => step.targetSelector === `[data-tour-target='tab-${id}']`,
            );
            if (gatedTab) {
              return (
                !!currentAgent &&
                isVisibleAgentTab(capabilities, currentAgent, gatedTab)
              );
            }
            if (
              step.targetSelector === "[data-tour-target='archivedMissions']"
            ) {
              return !!currentAgent;
            }
            // The AI Models hub is hidden from plain Teams members — drop its
            // tour step where the anchor never renders.
            if (step.targetSelector === "[data-tour-target='nav-ai-hub']") {
              return showAiModels;
            }
            return true;
          })}
          onDismiss={() => {
            setUiTourActive(false);
            // End the tour on the assistant's Routines tab so the freshly-seeded
            // Morning briefing routine is the last thing they land on — the
            // onboarding payoff. Applies whether the tour completed or was
            // skipped. `finishOnboarding` deliberately does NOT set viewMode
            // (the tour's first step would overwrite it); the landing lives here.
            setViewMode(tabOr("routines"));
          }}
        />
      )}
    </DetailPanelProvider>
  );
}
