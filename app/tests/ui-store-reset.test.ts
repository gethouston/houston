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
    s.setAgentMissionSearchQuery("agent-a", "invoices");

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    strictEqual(next.viewMode, "chat");
    strictEqual(next.activityPanelId, null);
    strictEqual(next.shareAgentId, null);
    strictEqual(next.paletteOpen, false);
    strictEqual(next.agentMissionSearchQueries["agent-a"], undefined);
  });

  it("keeps the per-machine layout preferences", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().setFilesViewMode("list");

    useUIStore.getState().reset();

    const next = useUIStore.getState();
    strictEqual(next.sidebarCollapsed, true);
    strictEqual(next.filesViewMode, "list");
  });

  it("resets archived mode when navigation leaves Activity", () => {
    const s = useUIStore.getState();
    s.setAgentBoardMode("archived");
    s.setViewMode("files");

    strictEqual(useUIStore.getState().agentBoardMode, "active");
  });

  it("resets archived mode for an agent switch and reset", () => {
    const s = useUIStore.getState();
    s.setAgentBoardMode("archived");
    // WorkspaceShell performs this on a current-agent change.
    s.setAgentBoardMode("active");
    strictEqual(useUIStore.getState().agentBoardMode, "active");

    s.setAgentBoardMode("archived");
    s.reset();
    strictEqual(useUIStore.getState().agentBoardMode, "active");
  });
});
