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

  it("a tab reset rebuilds the stack to the tapped root", () => {
    // The mobile tab bar's semantics: switching tabs abandons the old tab's
    // trail instead of stacking on top of it.
    const s = useUIStore.getState();
    s.openTeamView("team-a", "mission-control", { nav: "replace" });
    s.openSettings("shortcuts");
    useUIStore.getState().openTeamView("team-a", "mission-control", {
      nav: "reset",
    });
    const now = useUIStore.getState();
    assert.equal(now.navIndex, 0);
    assert.equal(now.navStack.length, 1);
    assert.equal(now.navStack[0].viewMode, "team");
    assert.equal(now.viewMode, "team");
  });

  it("openSettings resets to the index when the tab bar asks", () => {
    const s = useUIStore.getState();
    s.openSettings("shortcuts");
    useUIStore.getState().openSettings(null, { nav: "reset" });
    const now = useUIStore.getState();
    assert.equal(now.navIndex, 0);
    assert.equal(now.navStack.length, 1);
    assert.equal(now.viewMode, "settings");
    assert.equal(now.settingsSection, null);
  });

  it("agents home drill-in pushes; the back bar's retreat pops it", () => {
    // PRODUCT-1559: tapping an agent on the mobile Agents home pushes its
    // missions screen as a real nav level, so hardware back pops the drill.
    const s = useUIStore.getState();
    s.openAgentsHome(null, { nav: "replace" });
    s.openAgentsHome("agent-1");
    let now = useUIStore.getState();
    assert.equal(now.navIndex, 1);
    assert.equal(now.agentsHomeAgentId, "agent-1");
    assert.equal(now.navStack[1].agentsHomeAgentId, "agent-1");

    useUIStore.getState().openAgentsHome(null, { nav: "retreat" });
    now = useUIStore.getState();
    assert.equal(now.navIndex, 0);
    assert.equal(now.agentsHomeAgentId, null);
  });

  it("the Agents tab reset lands on the list, out of any drill", () => {
    const s = useUIStore.getState();
    s.openAgentsHome(null, { nav: "replace" });
    s.openAgentsHome("agent-1");
    useUIStore.getState().openAgentsHome(null, { nav: "reset" });
    const now = useUIStore.getState();
    assert.equal(now.navStack.length, 1);
    assert.equal(now.navIndex, 0);
    assert.equal(now.viewMode, "agents-home");
    assert.equal(now.agentsHomeAgentId, null);
  });

  it("openMissionChat pushes a chat level; closeMissionChat pops it", () => {
    // PRODUCT-1560: the phone chat is a first-class nav level over any view.
    const s = useUIStore.getState();
    s.openAgentsHome(null, { nav: "replace" });
    s.openAgentsHome("agent-1");
    s.openMissionChat("agent-1", "m-1");
    let now = useUIStore.getState();
    assert.equal(now.navIndex, 2);
    assert.equal(now.chatAgentId, "agent-1");
    assert.equal(now.chatMissionId, "m-1");
    // The chat pushed OVER the missions screen: the view fields underneath
    // ride along, so back lands exactly where the user was.
    assert.equal(now.navStack[2].viewMode, "agents-home");
    assert.equal(now.navStack[2].agentsHomeAgentId, "agent-1");

    useUIStore.getState().closeMissionChat();
    now = useUIStore.getState();
    assert.equal(now.navIndex, 1);
    assert.equal(now.chatAgentId, null);
    assert.equal(now.chatMissionId, null);
    assert.equal(now.agentsHomeAgentId, "agent-1");
  });

  it("the draft chat adopts its created mission by replacing in place", () => {
    const s = useUIStore.getState();
    s.openAgentsHome(null, { nav: "replace" });
    s.openMissionChat("agent-1", null);
    useUIStore.getState().openMissionChat("agent-1", "m-9", {
      nav: "replace",
    });
    const now = useUIStore.getState();
    assert.equal(now.navIndex, 1);
    assert.equal(now.navStack.length, 2);
    assert.equal(now.chatMissionId, "m-9");
    // Back must land under the draft, never re-open the blank composer.
    assert.equal(now.navStack[0].chatAgentId, null);
  });

  it("any other navigation closes the pushed chat", () => {
    const s = useUIStore.getState();
    s.openAgentsHome(null, { nav: "replace" });
    s.openMissionChat("agent-1", "m-1");
    // A tab reset while a chat is pushed: the chat must not survive onto the
    // new tab's root.
    useUIStore.getState().openSettings(null, { nav: "reset" });
    const now = useUIStore.getState();
    assert.equal(now.chatAgentId, null);
    assert.equal(now.chatMissionId, null);
    assert.equal(now.navStack.length, 1);
    assert.equal(now.navStack[0].chatAgentId, null);
  });

  it("navBack out of a chat entry restores the chat-less fields", () => {
    const s = useUIStore.getState();
    s.openAgentsHome(null, { nav: "replace" });
    s.openMissionChat("agent-1", "m-1");
    useUIStore.getState().navBack();
    const now = useUIStore.getState();
    assert.equal(now.chatAgentId, null);
    assert.equal(now.viewMode, "agents-home");
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
