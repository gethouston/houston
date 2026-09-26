import { cn, type Toast, ToastContainer, useIsMobile } from "@houston-ai/core";
import { useState } from "react";
import { useAssistantLanding } from "../../hooks/use-assistant-landing";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useSettingsLanding } from "../../hooks/use-settings-landing";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { phoneChromeHidden } from "../../lib/mobile-tabs";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { LessonRunner } from "../academy/lessons/lesson-runner";
import { CommandPalette } from "../command-palette";
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

/**
 * The app frame: the rail, the ONE floating screen card, and the shared detail
 * panel beside it.
 *
 * Every screen is a top-level view (`topLevelScreenViews`). Each employee's
 * work and settings live on their own screen. This frame holds the layout and
 * floating dialogs; {@link useWorkspaceViewGuards} owns the standing view rules.
 */
export function WorkspaceShell({
  toasts,
  onDismissToast,
}: WorkspaceShellProps) {
  // Personal plan prompts and presence stay mounted across app views.
  useSettingsLanding();
  useAssistantLanding();
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const activeLessonId = useUIStore((s) => s.activeLessonId);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(
    null,
  );
  // The top-level screen gates. The AI Models hub admits every caller;
  // `showSkills` limits the shared library to the space owner,
  // `showOrganization` admits Admin, and `showAssistant` depends on assistant
  // discovery. `ready` says when the guarded views can redirect without
  // bouncing a user during loading.
  const { showAiModels, showAssistant, showSkills, showOrganization, ready } =
    useSurfaceGates();
  // Keying the kept-alive set by workspace drops every cached screen when the
  // user switches workspace/space: their contents are workspace-scoped.
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const landing = useWorkspaceViewGuards({
    showAiModels,
    showAssistant,
    showSkills,
    showOrganization,
    ready,
  });
  useKeyboardShortcuts();

  const isMobile = useIsMobile();
  // The phone's pushed chat screen: chat is a PLACE below md, full-screen
  // over the content with the bottom chrome gone (`phoneChromeHidden` says
  // when). Desktop ignores the pair entirely.
  const chatAgentId = useUIStore((s) => s.chatAgentId);
  const mobileChatOpen = isMobile && chatAgentId !== null;
  const mobileBarsHidden =
    isMobile && phoneChromeHidden({ viewMode, chatAgentId, missionPanelOpen });
  // The wide chat: the panel takes the row and `<main>` steps out of the
  // layout (`use-panel-wide.ts` says when).
  const panelWide = usePanelWide();

  return (
    <DetailPanelProvider value={panelContainer}>
      {/* Transparent so the window background reads up through the content.
          The rail reserves space for native window controls; the content
          card reaches the top gutter. The column also hosts phone navigation.
          h-dvh (not h-screen) so mobile browser chrome (the collapsing URL
          bar) never pushes the composer below the visible viewport. */}
      {/* The PHONE is one flat background edge to edge: no gutter frame, no
          floating screen card. The desktop keeps the Arc canvas, where the
          transparent frame lets the window background read through. */}
      <div className="flex h-dvh flex-col bg-background text-ink md:bg-transparent">
        <div className="flex min-h-0 flex-1">
          <Sidebar>
            {/* Transparent row: on the desktop the window gutter shows in the
              gap-2 between the cards (and around them), and main + the mission
              panel are each their OWN rounded "screen" card so the rounding
              reads against it. The phone has no gutter, so no gap and no
              rounding. `relative` anchors the phone's full-screen mission
              panel overlay. In the macOS desktop window that gap is also a
              window drag region, like the gutter around it. */}
            <div
              data-tauri-drag-region={osIsTauri() && isMac ? true : undefined}
              className="relative flex min-w-0 flex-1 gap-0 overflow-hidden md:gap-2"
            >
              <main
                {...tourAnchor("main")}
                data-panel-wide={panelWide ? "true" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-background canvas-screen md:rounded-2xl",
                  // Out of the layout, not off-glass: the board stays mounted
                  // (kept alive like any hidden screen) with its selection,
                  // so shrinking the chat back lands on the same card.
                  panelWide && "md:hidden",
                )}
              >
                <TeamStatusBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <BootLandingContent landing={landing}>
                    <KeepAliveViews
                      key={currentWorkspace?.id ?? "no-workspace"}
                      activeId={viewMode}
                      views={topLevelScreenViews({
                        showAiModels,
                        showAssistant,
                        showSkills,
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
                  containerRef={setPanelContainer}
                />
              )}
              {mobileChatOpen && (
                <div className="absolute inset-0 z-40 overflow-hidden rounded-none bg-background canvas-screen md:rounded-2xl">
                  <MissionChatScreen />
                </div>
              )}
            </div>
          </Sidebar>
        </div>
        {/* The floating nav bar (AI Employees / More + compose); CSS-hidden
            at md+ and gone while a chat is up on the phone (pushed screen,
            the board's full-screen panel, the assistant): chat is a push, not
            a tab, so the back affordances are the way out and the composer
            gets the full height above the keyboard. */}
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
