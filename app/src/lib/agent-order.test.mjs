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
  return { groups: [], order: [], ...over };
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

test("new root agents lead stored entries in natural order", () => {
  const res = resolveSidebarSections(
    [agent("a"), agent("b"), agent("c"), agent("d")],
    layout({
      order: [
        { kind: "agent", id: "c" },
        { kind: "agent", id: "a" },
      ],
    }),
  );
  // b,d are absent from the stored order and lead in input order.
  assert.deepEqual(
    res.ungrouped.map((x) => x.id),
    ["b", "d", "c", "a"],
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
      order: [
        { kind: "agent", id: "d" },
        { kind: "agent", id: "b" },
      ],
    }),
  );
  assert.deepEqual(
    flat.map((x) => x.id),
    ["d", "b", "c", "a"],
  );
});

test("mixed root order renders agents between groups and drops unknown entries", () => {
  const res = resolveSidebarSections(
    [agent("a"), agent("b"), agent("inside"), agent("fresh")],
    layout({
      groups: [
        { id: "g1", name: "One", collapsed: false, agentIds: ["inside"] },
        { id: "g2", name: "Two", collapsed: false, agentIds: [] },
      ],
      order: [
        { kind: "group", id: "g1" },
        { kind: "agent", id: "a" },
        { kind: "group", id: "unknown" },
        { kind: "agent", id: "inside" },
        { kind: "group", id: "g2" },
        { kind: "agent", id: "b" },
      ],
    }),
  );
  assert.deepEqual(
    res.entries.map((entry) =>
      entry.kind === "agent"
        ? `agent:${entry.agent.id}`
        : `group:${entry.section.group.id}`,
    ),
    ["agent:fresh", "group:g1", "agent:a", "group:g2", "agent:b"],
  );
  assert.deepEqual(
    flatSidebarOrder(
      [agent("a"), agent("b"), agent("inside"), agent("fresh")],
      layout({
        groups: [
          { id: "g1", name: "One", collapsed: false, agentIds: ["inside"] },
        ],
        order: [
          { kind: "group", id: "g1" },
          { kind: "agent", id: "a" },
          { kind: "agent", id: "b" },
        ],
      }),
    ).map((item) => item.id),
    ["fresh", "inside", "a", "b"],
  );
});
