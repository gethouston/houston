import { isMobileViewport } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import {
  useSidebarLayoutReady,
  useSidebarLayoutValue,
} from "../../hooks/use-sidebar-layout";
import { firstSidebarAgentId } from "../../lib/agent-order";
import { analytics } from "../../lib/analytics";
import { openHome } from "../../lib/home-nav";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useOrgNav } from "../organization/org-nav-store.ts";
import { useBootLanding } from "./use-boot-landing.ts";
import {
  type BootLanding,
  deadViewStep,
  shouldDropAdminPin,
} from "./view-guard-rules.ts";

/**
 * Desktop boot opens the first employee in rail order once the roster and
 * layout resolve. The other standing rules keep the open view valid, keep a
 * current agent for routing, drop a pinned Admin section the settled org gate
 * will never let open, and record real view transitions.
 */
export function useWorkspaceViewGuards(gates: {
  showAiModels: boolean;
  showAssistant: boolean;
  showSkills: boolean;
  showOrganization: boolean;
  /** False while the reads behind the gates are still loading. */
  ready: boolean;
}): BootLanding {
  const { showAiModels, showAssistant, showSkills, showOrganization, ready } =
    gates;
  const viewMode = useUIStore((s) => s.viewMode);
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);
  const openAgentView = useUIStore((s) => s.openAgentView);
  const agentsHomeAgentId = useUIStore((s) => s.agentsHomeAgentId);
  const activeAgentId = useUIStore((s) => s.activeAgentId);
  const currentAgent = useAgentStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const loadedWorkspaceId = useAgentStore((s) => s.loadedWorkspaceId);
  const agentsLoading = useAgentStore((s) => s.loading);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const layout = useSidebarLayoutValue(workspaceId);
  const layoutReady = useSidebarLayoutReady(workspaceId);
  const agentsReady =
    !agentsLoading &&
    (workspaceId ? loadedWorkspaceId === workspaceId : agentsLoaded);

  const landing = useBootLanding(
    {
      workspaceId: workspaceId ?? null,
      viewMode,
      agentsHomeAgentId,
      activeAgentId,
      isMobile: isMobileViewport(),
      agentsReady,
      layoutReady,
      firstAgentId: firstSidebarAgentId(agents, layout),
    },
    (agentId) => openAgentView(agentId, "mission-control", { nav: "replace" }),
  );

  useEffect(() => {
    if (landing.kind !== "done") return;
    const action = deadViewStep({
      viewMode,
      showAiModels,
      showAssistant,
      showSkills,
      showOrganization,
      gatesReady: ready,
      agentsReady,
      activeAgentId,
      agents,
    });
    if (action !== "go-home") return;
    openHome({ nav: "replace" });
  }, [
    activeAgentId,
    agentsReady,
    agents,
    ready,
    showAiModels,
    showAssistant,
    showSkills,
    showOrganization,
    viewMode,
    landing.kind,
  ]);

  useEffect(() => {
    if (
      requestedTab !== null &&
      shouldDropAdminPin({ ready, showOrganization })
    )
      clearRequestedTab();
  }, [ready, showOrganization, requestedTab, clearRequestedTab]);

  useEffect(() => {
    if (!currentAgent && agents.length > 0) setCurrentAgent(agents[0]);
  }, [agents, currentAgent, setCurrentAgent]);

  const lastTracked = useRef<string | null>(null);
  useEffect(() => {
    if (lastTracked.current === null) {
      lastTracked.current = viewMode;
      return;
    }
    if (lastTracked.current === viewMode) return;
    lastTracked.current = viewMode;
    // Settings emits its OWN top-level event (`settings` for the index,
    // `settings:<id>` for a section) once the surface really renders. Emitting
    // here too would double-count every deep link, so the one view that owns
    // its event is skipped.
    //
    // Admin is NOT skipped: this is its only top-level event. What it tracks
    // itself is strictly a DRILL-IN — an Admin section detail
    // (`org:<section>`) — which fires on a narrower transition, never on
    // landing, so the pair reads as one view event plus its sub-navigation.
    if (viewMode === "settings") return;
    analytics.track("tab_opened", { tab_name: viewMode });
  }, [viewMode]);
  return landing;
}
