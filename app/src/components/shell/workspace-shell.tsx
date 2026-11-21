import { cn, type Toast, ToastContainer, useIsMobile } from "@houston-ai/core";
import { useState } from "react";
import { useAssistantLanding } from "../../hooks/use-assistant-landing";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useLinkedInCompletion } from "../../hooks/use-linkedin-completion";
import { useOrgCheckoutReturn } from "../../hooks/use-org-checkout-return";
import { useSettingsLanding } from "../../hooks/use-settings-landing";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { phoneChromeHidden } from "../../lib/mobile-tabs";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { LessonRunner } from "../academy/lessons/lesson-runner";
import { CommandPalette } from "../command-palette";
import { useFilePreviewSlot } from "../file-preview/preview-slot";
import { MissionChatScreen } from "../mission-chat/mission-chat-screen";
import { MobileNewMissionSheet } from "../mobile-new-mission-sheet";
import { ImportAgentWizard } from "../portable/import-wizard";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { AddToWorkspaceSheet } from "./add-to-workspace-sheet";
import { AgentWarmingDialog } from "./agent-warming-dialog";
import { BootLandingContent } from "./boot-landing-placeholder";
import { DetailPanelProvider } from "./detail-panel-context";
import { KeepAliveViews } from "./keep-alive-views";
import { MobileMoreMenu } from "./mobile-more-menu";
import { MobileNavBar } from "./mobile-nav-bar";
import { PlanLifecycle } from "./plan-lifecycle";
import { ProviderReconnectNotice } from "./provider-reconnect-notice";
import { ShellPanelCard } from "./shell-panel-card";
import { Sidebar } from "./sidebar";
import { TeamStatusBanner } from "./team-status-banner";
import { topLevelScreenViews } from "./top-level-screen-views";
import { usePanelWide } from "./use-panel-wide";
import { useWorkspaceViewGuards } from "./use-workspace-view-guards";
import { tourAnchor } from "./workspace-tour-steps.ts";

interface WorkspaceShellProps {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}

export function WorkspaceShell({
  toasts,
  onDismissToast,
}: WorkspaceShellProps) {
  useSettingsLanding();
  useOrgCheckoutReturn();
  useLinkedInCompletion();
  useAssistantLanding();
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const activeLessonId = useUIStore((s) => s.activeLessonId);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const { showAiModels, showAssistant, showOrganization, ready } =
    useSurfaceGates();
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const landing = useWorkspaceViewGuards({
    showAiModels,
    showAssistant,
    showOrganization,
    ready,
  });
  useKeyboardShortcuts();

  const isMobile = useIsMobile();
  const chatAgentId = useUIStore((s) => s.chatAgentId);
  const mobileChatOpen = isMobile && chatAgentId !== null;
  const mobileBarsHidden =
    isMobile && phoneChromeHidden({ viewMode, chatAgentId, missionPanelOpen });
  const preview = useFilePreviewSlot();
  const panelWide = usePanelWide() || (preview.open && missionPanelOpen);

  return (
    <DetailPanelProvider value={panelContainer}>
      <div className="flex h-dvh flex-col bg-background pt-safe text-ink md:bg-transparent">
        <div className="flex min-h-0 flex-1">
          <Sidebar>
            <div
              ref={preview.rowRef}
              data-tauri-drag-region={osIsTauri() && isMac ? true : undefined}
              className="relative flex min-w-0 flex-1 gap-0 overflow-hidden md:gap-2"
            >
              <main
                {...tourAnchor("main")}
                data-panel-wide={panelWide ? "true" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-background canvas-screen md:rounded-2xl",
                  (panelWide || preview.expanded) && "md:hidden",
                )}
              >
                <TeamStatusBanner />
                <ProviderReconnectNotice />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <BootLandingContent landing={landing}>
                    <KeepAliveViews
                      key={currentWorkspace?.id ?? "no-workspace"}
                      activeId={viewMode}
                      views={topLevelScreenViews({
                        showAiModels,
                        showOrganization,
                        ready,
                      })}
                    />
                  </BootLandingContent>
                </div>
              </main>
              {missionPanelOpen && (
                <ShellPanelCard
                  wide={panelWide}
                  stepsOut={preview.expanded}
                  containerRef={setPanelContainer}
                />
              )}
              {preview.slot}
              {mobileChatOpen && (
                <div className="absolute inset-0 z-40 overflow-hidden rounded-none bg-background canvas-screen md:rounded-2xl">
                  <MissionChatScreen />
                </div>
              )}
            </div>
          </Sidebar>
        </div>
        {!mobileBarsHidden && <MobileNavBar />}
        <MobileMoreMenu />
        <MobileNewMissionSheet />
        <AddToWorkspaceSheet />
        <AgentWarmingDialog />
        <PlanLifecycle />
        <ImportAgentWizard />
        <CommandPalette />
        <ShortcutCheatsheet />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </div>
      {activeLessonId !== null && (
        <LessonRunner key={activeLessonId} lessonId={activeLessonId} />
      )}
    </DetailPanelProvider>
  );
}
