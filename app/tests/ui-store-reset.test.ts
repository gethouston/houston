import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useUIStore } from "../src/stores/ui.ts";

// HOU-903: on an identity change the UI store must drop the outgoing account's
// ephemeral view state back to its initial values, while keeping the two
// per-machine layout preferences (which are device-, not account-, scoped).

afterEach(() => useUIStore.getState().reset());

describe("useUIStore.reset", () => {
  it("returns identity-scoped view state to its initial values", () => {
    const s = useUIStore.getState();
    s.setViewMode("settings");
    s.setActivityPanelId("activity-42", { forceOpen: true });
    s.setShareAgentId("agent-a");
    s.setPaletteOpen(true);
    s.openTeamView("team:default", "routines", { agentFilter: "agent-a" });
    s.setPendingRoutineChat({ agentId: "agent-a", activityId: "act-1" });

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    // The honest initial view: Mission Control, the app's home. There is no
    // per-agent screen to fall back to any more.
    strictEqual(next.viewMode, "dashboard");
    strictEqual(next.activityPanelId, null);
    strictEqual(next.shareAgentId, null);
    strictEqual(next.paletteOpen, false);
    strictEqual(next.activeTeamId, null);
    strictEqual(next.teamSection, null);
    strictEqual(next.teamAgentFilter, null);
    strictEqual(next.pendingRoutineChat, null);
  });

  it("keeps the per-machine layout preferences", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().setFilesViewMode("list");

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    strictEqual(next.sidebarCollapsed, true);
    strictEqual(next.filesViewMode, "list");
  });

  it("drops a one-shot routine-chat target on an identity change", () => {
    useUIStore
      .getState()
      .setPendingRoutineChat({ agentId: "agent-a", activityId: "act-1" });

    useUIStore.getState().reset();

    strictEqual(useUIStore.getState().pendingRoutineChat, null);
  });
});
