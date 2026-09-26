import {
  getCurrentSidebarLayout,
  isSidebarLayoutSettled,
} from "../hooks/use-sidebar-layout.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { firstSidebarAgentId } from "./agent-order.ts";
import { homeDestination } from "./home-destination.ts";
import type { NavMode } from "./nav-stack.ts";
import { AGENTS_HOME_VIEW_ID } from "./top-level-views.ts";
import { isMobileViewport } from "./viewport.ts";

/**
 * Go home ({@link homeDestination}): where the app opens and where every
 * fallback lands, read from the stores for store-free callers.
 */
export function openHome(opts?: { nav?: NavMode }): void {
  const workspaceId = useWorkspaceStore.getState().current?.id;
  const { agents, loading, loadedWorkspaceId } = useAgentStore.getState();
  const dest = homeDestination({
    isMobile: isMobileViewport(),
    rosterReady:
      !loading &&
      workspaceId !== undefined &&
      loadedWorkspaceId === workspaceId &&
      isSidebarLayoutSettled(workspaceId),
    firstAgentId: firstSidebarAgentId(
      agents,
      getCurrentSidebarLayout(workspaceId),
    ),
  });
  const ui = useUIStore.getState();
  if (dest.kind === "agent")
    ui.openAgentView(dest.agentId, "mission-control", opts);
  else ui.setViewMode(AGENTS_HOME_VIEW_ID, opts);
}
