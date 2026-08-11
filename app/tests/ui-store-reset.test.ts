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
    s.openTeamView("team:default", "routines", {
      agentFilter: "agent-a",
      agentFocus: true,
    });
    s.setPendingRoutineChat({ agentId: "agent-a", activityId: "act-1" });

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    // The honest initial view: the Inbox. Home is the first team's Mission
    // Control, and no team has resolved at this point, so the one screen that
    // needs no team is where the store starts (the shell's boot rule moves the
    // user on once a team lands).
    strictEqual(next.viewMode, "inbox");
    strictEqual(next.activityPanelId, null);
    strictEqual(next.shareAgentId, null);
    strictEqual(next.paletteOpen, false);
    strictEqual(next.activeTeamId, null);
    strictEqual(next.teamSection, null);
    strictEqual(next.teamAgentFilter, null);
    strictEqual(next.teamAgentFocus, false);
    strictEqual(next.pendingRoutineChat, null);
  });

  it("keeps the per-machine layout preferences", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    // All THREE rail bands fold and survive the same way. They are one band
    // anatomy wearing three labels, so a reset that kept one and dropped the
    // others would make the rail come back half the way the user left it.
    useUIStore.getState().toggleTeamsSectionCollapsed();
    useUIStore.getState().toggleMyAccountsSectionCollapsed();
    useUIStore.getState().toggleWorkspaceSectionCollapsed();

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    strictEqual(next.sidebarCollapsed, true);
    strictEqual(next.teamsSectionCollapsed, true);
    strictEqual(next.myAccountsSectionCollapsed, true);
    strictEqual(next.workspaceSectionCollapsed, true);
  });

  it("drops a one-shot routine-chat target on an identity change", () => {
    useUIStore
      .getState()
      .setPendingRoutineChat({ agentId: "agent-a", activityId: "act-1" });

    useUIStore.getState().reset();

    strictEqual(useUIStore.getState().pendingRoutineChat, null);
  });
});

describe("useUIStore.openTeamView", () => {
  it("normalizes focus without a filter and clears omitted options", () => {
    const store = useUIStore.getState();
    store.openTeamView("g1", "files", { agentFocus: true });
    strictEqual(useUIStore.getState().teamAgentFocus, false);
    store.openTeamView("g1", "files", {
      agentFilter: "a1",
      agentFocus: true,
    });
    strictEqual(useUIStore.getState().teamAgentFocus, true);
    store.openTeamView("g1", "mission-control");
    strictEqual(useUIStore.getState().teamAgentFilter, null);
    strictEqual(useUIStore.getState().teamAgentFocus, false);
  });
});
