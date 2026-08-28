import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initialNavState,
  type NavSourceFields,
  type NavState,
  navEntryOf,
  navigated,
  sameNavEntry,
  viewFieldsOf,
} from "../src/lib/nav-stack.ts";

// PRODUCT-1557: the nav stack's pure semantics. The store folds every
// navigation write through `navigated`; these tests pin how each NavMode
// lands on the stack without involving zustand or the browser.

const at = (viewMode: string, panelOpen = false): NavSourceFields => ({
  viewMode,
  settingsSection: null,
  activeTeamId: null,
  teamSection: null,
  teamAgentFilter: null,
  teamAgentFocus: false,
  teamSettingsFocus: false,
  agentsHomeAgentId: null,
  missionPanelOpen: panelOpen,
});

/** A source state sitting on `stack[index]`, ready for `navigated`. */
const state = (
  fields: NavSourceFields,
  nav: NavState,
): NavSourceFields & NavState => ({ ...fields, ...nav });

describe("navigated push", () => {
  it("appends the resulting location and advances the cursor", () => {
    const s = state(at("inbox"), initialNavState());
    const out = navigated(s, { viewMode: "settings" }, "push");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 1);
    assert.equal(out.navStack.length, 2);
    assert.ok(sameNavEntry(out.navStack[1], navEntryOf(at("settings"))));
  });

  it("re-navigating to the current location is not a move", () => {
    const s = state(at("inbox"), initialNavState());
    const out = navigated(s, { viewMode: "inbox" }, "push");
    assert.equal("navStack" in out, false);
  });

  it("truncates the forward set, like the browser's own pushState", () => {
    const stack = [navEntryOf(at("inbox")), navEntryOf(at("settings"))];
    const s = state(at("inbox"), { navStack: stack, navIndex: 0 });
    const out = navigated(s, { viewMode: "skills" }, "push");
    assert.ok("navStack" in out);
    assert.deepEqual(
      out.navStack.map((e) => e.viewMode),
      ["inbox", "skills"],
    );
    assert.equal(out.navIndex, 1);
  });
});

describe("navigated replace", () => {
  it("swaps the current entry without growing the stack", () => {
    const s = state(at("inbox"), initialNavState());
    const out = navigated(s, { viewMode: "team" }, "replace");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 0);
    assert.equal(out.navStack.length, 1);
    assert.equal(out.navStack[0].viewMode, "team");
  });
});

describe("navigated retreat", () => {
  it("pops when the previous entry is the destination, keeping the array", () => {
    const stack = [navEntryOf(at("team")), navEntryOf(at("team", true))];
    const s = state(at("team", true), { navStack: stack, navIndex: 1 });
    const out = navigated(s, { missionPanelOpen: false }, "retreat");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 0);
    // Identity preserved on a pop: the history mirror relies on it to tell a
    // retreat (echo with history.go) from a rebuild (echo with replaceState).
    assert.equal(out.navStack, stack);
  });

  it("replaces when the previous entry is somewhere else", () => {
    // Deep link straight into a Settings section from the team board: the
    // in-UI back to the index retreats WITHIN the surface, so browser back
    // still leaves it for the board.
    const stack = [
      navEntryOf(at("team")),
      navEntryOf({ ...at("settings"), settingsSection: "shortcuts" }),
    ];
    const s = state(
      { ...at("settings"), settingsSection: "shortcuts" },
      {
        navStack: stack,
        navIndex: 1,
      },
    );
    const out = navigated(s, { settingsSection: null }, "retreat");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 1);
    assert.equal(out.navStack.length, 2);
    assert.equal(out.navStack[1].settingsSection, null);
    assert.equal(out.navStack[0].viewMode, "team");
  });

  it("replaces at the root, where there is nothing to pop to", () => {
    const s = state(at("team", true), {
      navStack: [navEntryOf(at("team", true))],
      navIndex: 0,
    });
    const out = navigated(s, { missionPanelOpen: false }, "retreat");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 0);
    assert.equal(out.navStack[0].panelOpen, false);
  });
});

describe("navigated reset", () => {
  it("rebuilds the stack to the destination as its only entry", () => {
    const stack = [
      navEntryOf(at("team")),
      navEntryOf(at("skills")),
      navEntryOf(at("skills", true)),
    ];
    const s = state(at("skills", true), { navStack: stack, navIndex: 2 });
    const out = navigated(s, { viewMode: "settings" }, "reset");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 0);
    assert.equal(out.navStack.length, 1);
    assert.equal(out.navStack[0].viewMode, "settings");
    // A NEW array, never the popped-in-place identity: the history mirror
    // echoes a rebuild as replaceState, not history.go.
    assert.notEqual(out.navStack, stack);
  });

  it("still rebuilds when the destination IS the current location", () => {
    // Re-tapping the active tab at a drilled depth must abandon the trail.
    const stack = [navEntryOf(at("team")), navEntryOf(at("team", true))];
    const s = state(at("team", true), { navStack: stack, navIndex: 1 });
    const out = navigated(s, { missionPanelOpen: true }, "reset");
    assert.ok("navStack" in out);
    assert.equal(out.navIndex, 0);
    assert.equal(out.navStack.length, 1);
  });

  it("drops the forward set even from the root", () => {
    const stack = [navEntryOf(at("team")), navEntryOf(at("settings"))];
    const s = state(at("team"), { navStack: stack, navIndex: 0 });
    const out = navigated(s, { viewMode: "team" }, "reset");
    assert.ok("navStack" in out);
    assert.equal(out.navStack.length, 1);
    assert.equal(out.navStack[0].viewMode, "team");
  });

  it("is a no-op when the stack already is the bare root", () => {
    const s = state(at("inbox"), initialNavState());
    const out = navigated(s, { viewMode: "inbox" }, "reset");
    assert.equal("navStack" in out, false);
  });
});

describe("entry plumbing", () => {
  it("snapshots missionPanelOpen as the entry's panel level", () => {
    assert.equal(navEntryOf(at("team", true)).panelOpen, true);
  });

  it("viewFieldsOf never writes the derived panel flag back", () => {
    assert.equal(
      "panelOpen" in viewFieldsOf(navEntryOf(at("team", true))),
      false,
    );
    assert.equal(viewFieldsOf(navEntryOf(at("team"))).viewMode, "team");
  });

  it("boots as a single Inbox entry, matching the store's initial view", () => {
    const nav = initialNavState();
    assert.equal(nav.navIndex, 0);
    assert.equal(nav.navStack.length, 1);
    assert.ok(sameNavEntry(nav.navStack[0], navEntryOf(at("inbox"))));
  });
});
