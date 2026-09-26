import { deepStrictEqual, ok } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import {
  arrangementFromRows,
  computeSidebarSections,
  flattenSidebar,
  projectSidebarDrop,
} from "@houston-ai/layout";
import { arrangeOp } from "../src/lib/sidebar-layout-ops.ts";

const initial: SidebarLayout = {
  order: [
    { kind: "agent", id: "u" },
    { kind: "agent", id: "v" },
    { kind: "group", id: "g1" },
    { kind: "group", id: "g2" },
    { kind: "group", id: "g3" },
  ],
  groups: [
    { id: "g1", name: "One", collapsed: false, agentIds: ["a", "b"] },
    { id: "g2", name: "Two", collapsed: false, agentIds: ["c", "d"] },
    { id: "g3", name: "Three", collapsed: true, agentIds: ["e"] },
  ],
};

/** The rail's drop, end to end: layout → rows → drop → stored layout. */
function drop(
  layout: SidebarLayout,
  active: string,
  over: string,
  depthDelta = 0,
): SidebarLayout {
  const views = layout.groups.map((group) => ({
    id: group.id,
    name: group.name,
    collapsed: group.collapsed,
    itemIds: group.agentIds,
  }));
  const ids = ["u", "v", "a", "b", "c", "d", "e"];
  const sections = computeSidebarSections(
    ids.map((id) => ({ id, name: id })),
    views,
    layout.order,
  );
  const draggingGroup = active.startsWith("group:");
  const rows = flattenSidebar(sections, draggingGroup);
  const landed = projectSidebarDrop(rows, active, over, depthDelta);
  ok(landed);
  const hidden = Object.fromEntries(
    views
      .filter((view) => view.collapsed || draggingGroup)
      .map((view) => [view.id, view.itemIds]),
  );
  return arrangeOp(layout, arrangementFromRows(landed, hidden));
}

describe("sidebar drop to layout write", () => {
  it("reorders inside a group", () => {
    const next = drop(initial, "agent:b", "agent:a");
    deepStrictEqual(next.groups[0].agentIds, ["b", "a"]);
  });

  it("moves to another group at the hovered row", () => {
    const next = drop(initial, "agent:a", "agent:d");
    deepStrictEqual(next.groups[0].agentIds, ["b"]);
    deepStrictEqual(next.groups[1].agentIds, ["c", "d", "a"]);
  });

  it("moves a top-level employee into a collapsed group dragged right", () => {
    const next = drop(initial, "agent:u", "group:g3", 1);
    deepStrictEqual(next.groups[2].agentIds, ["e", "u"]);
    deepStrictEqual(next.order[0], { kind: "agent", id: "v" });
  });

  it("moves a member out to the top level before a hovered employee", () => {
    const next = drop(initial, "agent:a", "agent:v");
    deepStrictEqual(next.order.slice(0, 3), [
      { kind: "agent", id: "u" },
      { kind: "agent", id: "a" },
      { kind: "agent", id: "v" },
    ]);
    deepStrictEqual(next.groups[0].agentIds, ["b"]);
  });

  it("moves position 0 to position 1 at the top level", () => {
    const next = drop(initial, "agent:u", "agent:v");
    deepStrictEqual(next.order.slice(0, 2), [
      { kind: "agent", id: "v" },
      { kind: "agent", id: "u" },
    ]);
  });

  it("moves a group before a top-level employee, members intact", () => {
    const next = drop(initial, "group:g2", "agent:u");
    deepStrictEqual(next.order[0], { kind: "group", id: "g2" });
    deepStrictEqual(next.groups[1].agentIds, ["c", "d"]);
    deepStrictEqual(next.groups[0].agentIds, ["a", "b"]);
  });
});
