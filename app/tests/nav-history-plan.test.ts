import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readNavIndex, syncPlan } from "../src/lib/nav-history.ts";
import { navEntryOf } from "../src/lib/nav-stack.ts";

// PRODUCT-1557: the store→history echo, decided by a pure plan so the mirror's
// three verbs (pushState / replaceState / go) are testable without a browser.

const entry = (viewMode: string) =>
  navEntryOf({
    viewMode,
    settingsSection: null,
    activeTeamId: null,
    teamSection: null,
    teamAgentFilter: null,
    teamAgentFocus: false,
    teamSettingsFocus: false,
    missionPanelOpen: false,
  });

describe("syncPlan", () => {
  it("ignores store changes that did not move the stack", () => {
    const stack = [entry("inbox")];
    assert.equal(syncPlan({ index: 0, stack }, { index: 0, stack }), null);
  });

  it("echoes a push as pushState at the new index", () => {
    const prev = [entry("inbox")];
    const next = [...prev, entry("settings")];
    assert.deepEqual(
      syncPlan({ index: 0, stack: prev }, { index: 1, stack: next }),
      { op: "push", index: 1 },
    );
  });

  it("echoes a pop (same array, cursor back) as history.go", () => {
    const stack = [entry("inbox"), entry("settings")];
    assert.deepEqual(syncPlan({ index: 1, stack }, { index: 0, stack }), {
      op: "go",
      delta: -1,
    });
  });

  it("echoes an in-place swap as replaceState", () => {
    const prev = [entry("inbox")];
    const next = [entry("team")];
    assert.deepEqual(
      syncPlan({ index: 0, stack: prev }, { index: 0, stack: next }),
      { op: "replace", index: 0 },
    );
  });

  it("echoes a rebuild (reset: cursor back, NEW array) as replaceState", () => {
    // The browser's deeper entries can't be deleted, so a rebuild re-brands
    // the current one and lets the stale entries decay via the clamp.
    const prev = [entry("inbox"), entry("settings")];
    const next = [entry("inbox")];
    assert.deepEqual(
      syncPlan({ index: 1, stack: prev }, { index: 0, stack: next }),
      { op: "replace", index: 0 },
    );
  });
});

describe("readNavIndex", () => {
  it("reads our namespaced index and rejects everything else", () => {
    assert.equal(readNavIndex({ __houstonNavIndex: 3 }), 3);
    assert.equal(readNavIndex({ __houstonNavIndex: -1 }), null);
    assert.equal(readNavIndex({ __houstonNavIndex: "3" }), null);
    assert.equal(readNavIndex({ other: 3 }), null);
    assert.equal(readNavIndex(null), null);
    assert.equal(readNavIndex(undefined), null);
  });
});
