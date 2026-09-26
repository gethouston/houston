import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useUIStore } from "../src/stores/ui.ts";

// HOU-903: on an identity change the UI store must drop the outgoing account's
// ephemeral view state back to its initial values, while keeping the
// per-machine layout preferences (which are device-, not account-, scoped).

afterEach(() => useUIStore.getState().reset());

describe("useUIStore.reset", () => {
  it("returns identity-scoped view state to its initial values", () => {
    const s = useUIStore.getState();
    s.setViewMode("settings");
    s.setActivityPanelId("activity-42", { forceOpen: true });
    s.setPaletteOpen(true);
    s.openAgentView("agent-a", "routines");
    s.setPendingRoutineChat({ agentId: "agent-a", activityId: "act-1" });

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    // The honest initial view: the Agents home. Home is the first team's
    // Mission Control, and no team has resolved at this point, so the screen
    // that needs no team is where the store starts (the shell's boot rule
    // moves the user on once a team lands).
    strictEqual(next.viewMode, "agents-home");
    strictEqual(next.activityPanelId, null);
    strictEqual(next.paletteOpen, false);
    strictEqual(next.activeAgentId, null);
    strictEqual(next.agentSection, null);
    strictEqual(next.pendingRoutineChat, null);
  });

  it("keeps the per-machine layout preferences", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    // "Your AI Employees" is the rail's one labelled band, and its fold is a layout
    // pref like the rail's own width: the rail must come back the way the user
    // left it, whoever signs in next.
    useUIStore.getState().toggleTeamsSectionCollapsed();
    // The wide chat is the same kind of pref: how THIS machine lays out the
    // chat, not something the next account should have to choose again.
    useUIStore.getState().setChatWide(true);

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    strictEqual(next.sidebarCollapsed, true);
    strictEqual(next.chatWide, true);
    strictEqual(next.teamsSectionCollapsed, true);
  });

  it("drops a one-shot routine-chat target on an identity change", () => {
    useUIStore
      .getState()
      .setPendingRoutineChat({ agentId: "agent-a", activityId: "act-1" });

    useUIStore.getState().reset();

    strictEqual(useUIStore.getState().pendingRoutineChat, null);
  });
});

describe("useUIStore.openAgentView", () => {
  it("writes the employee and section together", () => {
    const store = useUIStore.getState();
    store.openAgentView("a1", "files");
    strictEqual(useUIStore.getState().viewMode, "agent");
    strictEqual(useUIStore.getState().activeAgentId, "a1");
    strictEqual(useUIStore.getState().agentSection, "files");
    store.openAgentView("a2", "settings");
    strictEqual(useUIStore.getState().activeAgentId, "a2");
    strictEqual(useUIStore.getState().agentSection, "settings");
  });
});
