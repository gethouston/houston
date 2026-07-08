import assert from "node:assert/strict";
import test from "node:test";
import { flatSidebarOrder, resolveSidebarSections } from "./agent-order.ts";

/** Minimal Agent factory; only the fields the ordering reads. */
function agent(id, extra = {}) {
  return {
    id,
    name: extra.name ?? id,
    folderPath: `/w/${id}`,
    configId: "cfg",
    createdAt: extra.createdAt ?? "2020-01-01T00:00:00.000Z",
    ...extra,
  };
}

function layout(over = {}) {
  return { groups: [], ungroupedOrder: [], ...over };
}

test("empty layout: keeps input order (no stored order yet)", () => {
  const res = resolveSidebarSections(
    [agent("a"), agent("b"), agent("c")],
    layout(),
  );
  assert.equal(res.groups.length, 0);
  assert.deepEqual(
    res.ungrouped.map((x) => x.id),
    ["a", "b", "c"],
  );
});

test("ungroupedOrder wins, new agents appended stably", () => {
  const res = resolveSidebarSections(
    [agent("a"), agent("b"), agent("c"), agent("d")],
    layout({ ungroupedOrder: ["c", "a"] }),
  );
  // c,a from stored order; b,d (new) appended in input order.
  assert.deepEqual(
    res.ungrouped.map((x) => x.id),
    ["c", "a", "b", "d"],
  );
});

test("groups: members partitioned out of ungrouped, in agentIds order", () => {
  const res = resolveSidebarSections(
    [agent("a"), agent("b"), agent("c")],
    layout({
      groups: [{ id: "g1", name: "G1", collapsed: false, agentIds: ["b"] }],
    }),
  );
  assert.equal(res.groups.length, 1);
  assert.deepEqual(
    res.groups[0].agents.map((x) => x.id),
    ["b"],
  );
  assert.deepEqual(
    res.ungrouped.map((x) => x.id),
    ["a", "c"],
  );
});

test("stale ids in a group are dropped, not rendered", () => {
  const res = resolveSidebarSections(
    [agent("a")],
    layout({
      groups: [
        { id: "g1", name: "G1", collapsed: false, agentIds: ["a", "gone"] },
      ],
    }),
  );
  assert.deepEqual(
    res.groups[0].agents.map((x) => x.id),
    ["a"],
  );
});

test("an id in two groups lands in the first only", () => {
  const res = resolveSidebarSections(
    [agent("a")],
    layout({
      groups: [
        { id: "g1", name: "G1", collapsed: false, agentIds: ["a"] },
        { id: "g2", name: "G2", collapsed: false, agentIds: ["a"] },
      ],
    }),
  );
  assert.deepEqual(
    res.groups[0].agents.map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(res.groups[1].agents, []);
});

test("manual group order respects agentIds", () => {
  const res = resolveSidebarSections(
    [agent("a"), agent("b"), agent("c")],
    layout({
      groups: [
        { id: "g1", name: "G1", collapsed: false, agentIds: ["c", "a"] },
      ],
    }),
  );
  assert.deepEqual(
    res.groups[0].agents.map((x) => x.id),
    ["c", "a"],
  );
});

test("flatSidebarOrder: groups (display order) then ungrouped", () => {
  const flat = flatSidebarOrder(
    [agent("a"), agent("b"), agent("c"), agent("d")],
    layout({
      groups: [
        { id: "g1", name: "G1", collapsed: false, agentIds: ["c"] },
        { id: "g2", name: "G2", collapsed: false, agentIds: ["a"] },
      ],
      ungroupedOrder: ["d", "b"],
    }),
  );
  assert.deepEqual(
    flat.map((x) => x.id),
    ["c", "a", "d", "b"],
  );
});
