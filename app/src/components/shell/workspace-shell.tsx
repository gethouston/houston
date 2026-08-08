import { cn, type Toast, ToastContainer, useIsMobile } from "@houston-ai/core";
import { useState } from "react";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { CommandPalette } from "../command-palette";
import { ExportAgentWizard } from "../portable/export-wizard";
import { ImportAgentWizard } from "../portable/import-wizard";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { AgentWarmingDialog } from "./agent-warming-dialog";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { DetailPanelProvider } from "./detail-panel-context";
import { KeepAliveViews } from "./keep-alive-views";
import { MobileTopBar } from "./mobile-top-bar";
import { Sidebar } from "./sidebar";
import { TeamStatusBanner } from "./team-status-banner";
import { topLevelScreenViews } from "./top-level-screen-views";
import { useWorkspaceViewGuards } from "./use-workspace-view-guards";
import { WorkspaceTourOverlay } from "./workspace-tour-overlay";
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
export function WorkspaceShell({
  toasts,
  onDismissToast,
}: WorkspaceShellProps) {
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(
    null,
  );
  // `showAiModels` guards the AI Models hub render so a stale `viewMode` can
  // never show it to a plain member (the sidebar already hides the entry) — the
  // hub is owner/admin only in a Teams workspace (org-level providers + admin
  // model policy).
  const { showAiModels } = useSurfaceGates();
  // Keying the kept-alive set by workspace drops every cached screen when the
  // user switches workspace/space: their contents are workspace-scoped.
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  useWorkspaceViewGuards(showAiModels);
  useKeyboardShortcuts();

  const isMobile = useIsMobile();

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
                {...tourAnchor("main")}
                className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background canvas-screen"
              >
                <TeamStatusBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <KeepAliveViews
                    key={currentWorkspace?.id ?? "no-workspace"}
                    activeId={viewMode}
                    views={topLevelScreenViews({ showAiModels })}
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
      {uiTourActive && <WorkspaceTourOverlay />}
    </DetailPanelProvider>
  );
}
