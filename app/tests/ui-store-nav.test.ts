import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { navEntryOf } from "../src/lib/nav-stack.ts";
import { useUIStore } from "../src/stores/ui.ts";

// PRODUCT-1557: the ui store's nav-aware actions. Every navigation write folds
// into the stack (push / replace / retreat), navBack walks it back the way a
// browser back button would, and the panel level closes through its owner.

afterEach(() => useUIStore.getState().reset());

const views = () => {
  const s = useUIStore.getState();
  return s.navStack.map((e) => e.viewMode);
};

describe("nav-aware actions", () => {
  it("keeps the stack root coherent with the store's initial view fields", () => {
    const s = useUIStore.getState();
    assert.deepEqual(s.navStack[0], navEntryOf(s));
    assert.equal(s.navIndex, 0);
  });

  it("pushes on view changes and dedupes a re-click", () => {
    const s = useUIStore.getState();
    s.setViewMode("skills");
    s.setViewMode("skills");
    assert.deepEqual(views(), ["inbox", "skills"]);
    assert.equal(useUIStore.getState().navIndex, 1);
  });

  it("replaces on a redirect, keeping the transient view off the stack", () => {
    // The boot rule: Inbox → first team's Mission Control is not a place the
    // user chose, so browser back must not land on the boot Inbox.
    useUIStore
      .getState()
      .openTeamView("team-a", "mission-control", { nav: "replace" });
    assert.deepEqual(views(), ["team"]);
    assert.equal(useUIStore.getState().navIndex, 0);
  });

  it("settings drill-in pushes; back to the index pops", () => {
    const s = useUIStore.getState();
    s.openSettings(null);
    s.setSettingsSection("shortcuts");
    assert.equal(useUIStore.getState().navIndex, 2);
    s.setSettingsSection(null);
    const after = useUIStore.getState();
    assert.equal(after.navIndex, 1);
    assert.equal(after.settingsSection, null);
    assert.equal(after.navStack.length, 3);
  });

  it("panel open pushes a level; the last owner's release pops it", () => {
    const s = useUIStore.getState();
    s.openTeamView("team-a", "mission-control", { nav: "replace" });
    s.setMissionPanelOwner("board", true);
    let now = useUIStore.getState();
    assert.equal(now.navIndex, 1);
    assert.equal(now.navStack[1].panelOpen, true);

    s.setMissionPanelOwner("board", false);
    now = useUIStore.getState();
    assert.equal(now.navIndex, 0);
    assert.equal(now.missionPanelOpen, false);
  });

  it("a second claim on an already-open panel is not a move", () => {
    const s = useUIStore.getState();
    s.setMissionPanelOwner("board", true);
    s.setMissionPanelOwner("routines", true);
    assert.equal(useUIStore.getState().navIndex, 1);
    s.setMissionPanelOwner("routines", false);
    // Still one owner left: the panel stays open, the stack stays put.
    const now = useUIStore.getState();
    assert.equal(now.navIndex, 1);
    assert.equal(now.missionPanelOpen, true);
  });

  it("closeMissionPanel retreats the panel level like the owner release", () => {
    const s = useUIStore.getState();
    s.setMissionPanelOwner("board", true);
    s.closeMissionPanel();
    const now = useUIStore.getState();
    assert.equal(now.navIndex, 0);
    assert.deepEqual(now.missionPanelOwners, []);
  });
});

describe("navBack / navApplyHistory", () => {
  it("navBack restores the previous entry's view fields", () => {
    const s = useUIStore.getState();
    s.openTeamView("team-a", "mission-control", { nav: "replace" });
    s.openSettings("shortcuts");
    s.navBack();
    const now = useUIStore.getState();
    assert.equal(now.viewMode, "team");
    assert.equal(now.activeTeamId, "team-a");
    assert.equal(now.navIndex, 0);
    // The popped entry stays on the stack: forward can re-land on it.
    assert.equal(now.navStack.length, 2);
  });

  it("navApplyHistory jumps forward onto a still-stacked entry", () => {
    const s = useUIStore.getState();
    s.setViewMode("skills");
    s.navBack();
    s.navApplyHistory(1);
    const now = useUIStore.getState();
    assert.equal(now.viewMode, "skills");
    assert.equal(now.navIndex, 1);
  });

  it("clamps a stale index (a pre-refresh history entry) onto the stack", () => {
    useUIStore.getState().navApplyHistory(7);
    assert.equal(useUIStore.getState().navIndex, 0);
    useUIStore.getState().setViewMode("skills");
    useUIStore.getState().navApplyHistory(-3);
    assert.equal(useUIStore.getState().navIndex, 0);
    assert.equal(useUIStore.getState().viewMode, "inbox");
  });

  it("closes an open panel through its registered owner on back", () => {
    const s = useUIStore.getState();
    s.openTeamView("team-a", "mission-control", { nav: "replace" });
    s.setMissionPanelOwner("board", true);
    // The board's closer deselects, which releases the claim — modeled here.
    let closed = 0;
    s.setOnPanelClose(() => {
      closed += 1;
      useUIStore.getState().setMissionPanelOwner("board", false);
    });

    useUIStore.getState().navBack();

    const now = useUIStore.getState();
    assert.equal(closed, 1);
    assert.equal(now.missionPanelOpen, false);
    // The closer's own release found the stack already at the panel-less
    // entry, so it folded in as a no-op instead of double-popping.
    assert.equal(now.navIndex, 0);
  });

  it("falls back to closeMissionPanel when no closer is registered", () => {
    const s = useUIStore.getState();
    s.setMissionPanelOwner("setup-chat", true);
    s.navBack();
    const now = useUIStore.getState();
    assert.equal(now.missionPanelOpen, false);
    assert.deepEqual(now.missionPanelOwners, []);
    assert.equal(now.navIndex, 0);
  });

  it("reset returns the stack to the single boot entry", () => {
    const s = useUIStore.getState();
    s.setViewMode("skills");
    s.setMissionPanelOwner("board", true);
    useUIStore.getState().reset();
    const now = useUIStore.getState();
    assert.equal(now.navStack.length, 1);
    assert.equal(now.navIndex, 0);
    assert.equal(now.navStack[0].viewMode, "inbox");
  });
});
