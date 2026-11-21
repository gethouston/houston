import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useUIStore } from "../src/stores/ui.ts";

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
    strictEqual(next.viewMode, "agents-home");
    strictEqual(next.activityPanelId, null);
    strictEqual(next.paletteOpen, false);
    strictEqual(next.activeAgentId, null);
    strictEqual(next.agentSection, null);
    strictEqual(next.pendingRoutineChat, null);
  });

  it("keeps the per-machine layout preferences", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().setChatWide(true);

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    strictEqual(next.sidebarCollapsed, true);
    strictEqual(next.chatWide, true);
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
