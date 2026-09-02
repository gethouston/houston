import { cn, type Toast, ToastContainer, useIsMobile } from "@houston-ai/core";
import { useState } from "react";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { LessonRunner } from "../academy/lessons/lesson-runner";
import { CommandPalette } from "../command-palette";
import { MissionChatScreen } from "../mission-chat/mission-chat-screen";
import { MobileNewMissionSheet } from "../mobile-new-mission-sheet";
import { InAppOnboarding } from "../onboarding/in-app-onboarding";
import { ExportAgentWizard } from "../portable/export-wizard";
import { ImportAgentWizard } from "../portable/import-wizard";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { AgentWarmingDialog } from "./agent-warming-dialog";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { DetailPanelProvider } from "./detail-panel-context";
import { KeepAliveViews } from "./keep-alive-views";
import { MobileHeaderSlotProvider } from "./mobile-header-slot";
import { MobileTabBar } from "./mobile-tab-bar";
import { MobileTopBar } from "./mobile-top-bar";
import { Sidebar } from "./sidebar";
import { TeamStatusBanner } from "./team-status-banner";
import { topLevelScreenViews } from "./top-level-screen-views";
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
 * Every screen is a top-level view (`topLevelScreenViews`) — Mission Control, a
 * team, Integrations, Skills, the Store, Settings, the AI hub. Agents have no
 * screen of their own: an agent's work is a slice of its TEAM's sections, and
 * configuring one is the agent settings page reached through Team Settings.
 * `lib/agent-nav.ts` owns that translation, so the frame never has to know it,
 * and this file is layout plus the dialogs that float over it — the standing
 * view rules live in {@link useWorkspaceViewGuards}.
 */
export function WorkspaceShell(props: WorkspaceShellProps) {
  // The phone top bar's title slot is shared between the bar (inside the
  // frame) and every screen's page header, so the provider sits above both.
  return (
    <MobileHeaderSlotProvider>
      <WorkspaceShellFrame {...props} />
    </MobileHeaderSlotProvider>
  );
}

function WorkspaceShellFrame({ toasts, onDismissToast }: WorkspaceShellProps) {
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const inAppOnboardingActive = useUIStore((s) => s.inAppOnboardingActive);
  const activeLessonId = useUIStore((s) => s.activeLessonId);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(
    null,
  );
  // The gated top-level screens. `showAiModels` keeps a stale `viewMode` from
  // showing the AI Models hub to a plain member (it is owner/admin only in a
  // Teams workspace: org-level providers + admin model policy);
  // `showOrganization` does the same for Admin (multiplayer owner/admin, and a
  // TEAM active space on a Spaces host). `ready` says whether the gates mean
  // anything yet, so the guard waits instead of bouncing a user mid-load.
  const { showAiModels, showOrganization, ready } = useSurfaceGates();
  // Keying the kept-alive set by workspace drops every cached screen when the
  // user switches workspace/space: their contents are workspace-scoped.
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  useWorkspaceViewGuards({ showAiModels, showOrganization, ready });
  useKeyboardShortcuts();

  const isMobile = useIsMobile();
  // The phone's pushed chat screen (PRODUCT-1555 arc): chat is a PLACE below
  // md — full-screen over the content, both mobile bars hidden while it is
  // up (a push, not a tab; the back affordances are the way out). Desktop
  // ignores the pair entirely.
  const chatAgentId = useUIStore((s) => s.chatAgentId);
  const mobileChatOpen = isMobile && chatAgentId !== null;
  const mobileBarsHidden = mobileChatOpen || (isMobile && missionPanelOpen);

  return (
    <DetailPanelProvider value={panelContainer}>
      {/* Transparent so the window background reads up through the content.
          Column layout: a seamless overlay title-bar strip on top, then the
          sidebar + content row below it.
          h-dvh (not h-screen) so mobile browser chrome (the collapsing URL
          bar) never pushes the composer below the visible viewport.
          The shell stays fully interactive under the in-app onboarding: the
          user must click the real controls, so that overlay does its own
          selective blocking. */}
      <div className="flex h-dvh flex-col bg-transparent text-ink">
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
            {/* Hamburger row for the mobile drawer; CSS-hidden at md+, gone
                entirely while the chat screen is pushed (the chat's own back
                bar is the header then). */}
            {!mobileBarsHidden && <MobileTopBar />}
            {/* Transparent row: the window gutter shows in the gap-2 between
              the cards (and around them). main + the mission panel are each
              their OWN rounded frosted "screen" card, so the rounding reads
              against the gutter. `relative` anchors the mobile full-screen
              mission panel overlay. */}
            <div className="relative flex min-w-0 flex-1 overflow-hidden gap-2">
              <main
                {...tourAnchor("main")}
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background canvas-screen"
              >
                <TeamStatusBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <KeepAliveViews
                    key={currentWorkspace?.id ?? "no-workspace"}
                    activeId={viewMode}
                    views={topLevelScreenViews({
                      showAiModels,
                      showOrganization,
                    })}
                  />
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
              {mobileChatOpen && (
                <div className="absolute inset-0 z-40 overflow-hidden rounded-2xl bg-background canvas-screen">
                  <MissionChatScreen />
                </div>
              )}
            </div>
          </Sidebar>
        </div>
        {/* Bottom tab bar (Agents / Tasks / Settings); CSS-hidden at md+ and
            gone while a chat is up on the phone (pushed screen or the
            board's full-screen panel): chat is a push, not a tab, so the
            back affordances are the way out and the composer gets the full
            height above the keyboard. */}
        {!mobileBarsHidden && <MobileTabBar />}
        <MobileNewMissionSheet />
        <CreateAgentDialog />
        <AgentWarmingDialog />
        <ExportAgentWizard />
        <ImportAgentWizard />
        <CommandPalette />
        <ShortcutCheatsheet />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </div>
      {inAppOnboardingActive && <InAppOnboarding />}
      {/* The guided setup OWNS the screen while it runs: both surfaces spotlight
          the real app, so two of them at once would point at two controls and
          teach neither. Arming the setup clears any armed lesson (`stores/ui`);
          this is the other direction, a lesson armed while it is already up. */}
      {!inAppOnboardingActive && activeLessonId !== null && (
        <LessonRunner key={activeLessonId} lessonId={activeLessonId} />
      )}
    </DetailPanelProvider>
  );
}
