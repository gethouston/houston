import assert from "node:assert/strict";
import test from "node:test";
import {
  createGroupOp,
  DEFAULT_SIDEBAR_LAYOUT,
  deleteGroupOp,
  moveGroupOp,
  moveItemOp,
  normalizeSidebarLayout,
  renameGroupOp,
  toggleGroupCollapsedOp,
} from "./sidebar-layout-ops.ts";

function base(over = {}) {
  return { groups: [], ungroupedOrder: [], ...over };
}
function group(id, agentIds, over = {}) {
  return { id, name: id, collapsed: false, agentIds, ...over };
}

test("DEFAULT is empty", () => {
  assert.deepEqual(DEFAULT_SIDEBAR_LAYOUT, {
    groups: [],
    ungroupedOrder: [],
  });
});

test("createGroupOp appends an empty expanded group", () => {
  const next = createGroupOp(base(), "g1", "Work");
  assert.deepEqual(next.groups, [
    { id: "g1", name: "Work", collapsed: false, agentIds: [] },
  ]);
});

test("renameGroupOp renames only the target", () => {
  const l = base({ groups: [group("g1", []), group("g2", [])] });
  const next = renameGroupOp(l, "g2", "Renamed");
  assert.equal(next.groups[1].name, "Renamed");
  assert.equal(next.groups[0].name, "g1");
});

test("deleteGroupOp frees members to ungrouped (appended)", () => {
  const l = base({
    groups: [group("g1", ["a", "b"])],
    ungroupedOrder: ["c"],
  });
  const next = deleteGroupOp(l, "g1");
  assert.equal(next.groups.length, 0);
  assert.deepEqual(next.ungroupedOrder, ["c", "a", "b"]);
});

test("deleteGroupOp does not duplicate an id already ungrouped", () => {
  const l = base({ groups: [group("g1", ["a"])], ungroupedOrder: ["a"] });
  const next = deleteGroupOp(l, "g1");
  assert.deepEqual(next.ungroupedOrder, ["a"]);
});

test("toggleGroupCollapsedOp flips the flag", () => {
  const l = base({ groups: [group("g1", [], { collapsed: false })] });
  assert.equal(toggleGroupCollapsedOp(l, "g1").groups[0].collapsed, true);
});

test("moveItemOp: into a group before a sibling", () => {
  const l = base({
    groups: [group("g1", ["a", "b"])],
    ungroupedOrder: ["c"],
  });
  const next = moveItemOp(l, "c", { groupId: "g1", beforeItemId: "b" });
  assert.deepEqual(next.groups[0].agentIds, ["a", "c", "b"]);
  assert.deepEqual(next.ungroupedOrder, []);
});

test("moveItemOp: append to default section (nulls)", () => {
  const l = base({
    groups: [group("g1", ["a"])],
    ungroupedOrder: ["b"],
  });
  const next = moveItemOp(l, "a", { groupId: null, beforeItemId: null });
  assert.deepEqual(next.groups[0].agentIds, []);
  assert.deepEqual(next.ungroupedOrder, ["b", "a"]);
});

test("moveItemOp: reorder within default section, no duplicate", () => {
  const l = base({ ungroupedOrder: ["a", "b", "c"] });
  const next = moveItemOp(l, "c", { groupId: null, beforeItemId: "a" });
  assert.deepEqual(next.ungroupedOrder, ["c", "a", "b"]);
});

test("moveItemOp: moving between groups removes from the source", () => {
  const l = base({ groups: [group("g1", ["a", "b"]), group("g2", [])] });
  const next = moveItemOp(l, "a", { groupId: "g2", beforeItemId: null });
  assert.deepEqual(next.groups[0].agentIds, ["b"]);
  assert.deepEqual(next.groups[1].agentIds, ["a"]);
});

test("moveGroupOp: before another group", () => {
  const l = base({
    groups: [group("g1", []), group("g2", []), group("g3", [])],
  });
  const next = moveGroupOp(l, "g3", "g1");
  assert.deepEqual(
    next.groups.map((g) => g.id),
    ["g3", "g1", "g2"],
  );
});

test("moveGroupOp: null target moves to the end", () => {
  const l = base({ groups: [group("g1", []), group("g2", [])] });
  const next = moveGroupOp(l, "g1", null);
  assert.deepEqual(
    next.groups.map((g) => g.id),
    ["g2", "g1"],
  );
});

test("normalizeSidebarLayout: undefined / null / non-object -> default", () => {
  assert.deepEqual(normalizeSidebarLayout(undefined), DEFAULT_SIDEBAR_LAYOUT);
  assert.deepEqual(normalizeSidebarLayout(null), DEFAULT_SIDEBAR_LAYOUT);
  assert.deepEqual(normalizeSidebarLayout("nope"), DEFAULT_SIDEBAR_LAYOUT);
  assert.deepEqual(normalizeSidebarLayout([]), DEFAULT_SIDEBAR_LAYOUT);
});

test("normalizeSidebarLayout: partial object gets defaulted fields", () => {
  // The crash repro: a truthy object with no `groups` array.
  assert.deepEqual(normalizeSidebarLayout({ error: "not found" }), {
    groups: [],
    ungroupedOrder: [],
  });
});

test("normalizeSidebarLayout: drops malformed groups, keeps valid ones", () => {
  const out = normalizeSidebarLayout({
    groups: [
      group("ok", ["a"]),
      { id: "bad" }, // missing name/collapsed/agentIds
      { id: 1, name: "x", collapsed: false, agentIds: [] }, // non-string id
      null,
    ],
    ungroupedOrder: ["b"],
  });
  assert.deepEqual(out.groups, [group("ok", ["a"])]);
  assert.deepEqual(out.ungroupedOrder, ["b"]);
});

test("normalizeSidebarLayout: bad ungroupedOrder falls back to []", () => {
  const out = normalizeSidebarLayout({
    groups: [],
    ungroupedOrder: [1, 2],
  });
  assert.deepEqual(out.ungroupedOrder, []);
});
