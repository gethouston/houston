import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston-ai/engine-client";
import {
  moveItemOp,
  remapAgentIdOp,
  toggleGroupCollapsedOp,
} from "../src/lib/sidebar-layout-ops.ts";

/** A stored group as the LOCAL backend always has it: named, and already in
 *  `layout.groups` because that is where `resolveTeams` reads teams from. */
const group = (id: string, agentIds: string[]) => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
});

const layout = (over: Partial<SidebarLayout>): SidebarLayout => ({
  groups: [],
  ungroupedOrder: [],
  ...over,
});

describe("remapAgentIdOp", () => {
  it("keeps a grouped agent at its existing position", () => {
    const result = remapAgentIdOp(
      layout({
        groups: [
          {
            id: "group",
            name: "Group",
            collapsed: false,
            agentIds: ["a", "old", "b"],
          },
        ],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["a", "new", "b"]);
  });

  it("keeps an ungrouped agent at its existing position", () => {
    const result = remapAgentIdOp(
      layout({ ungroupedOrder: ["a", "old", "b"] }),
      "old",
      "new",
    );
    deepStrictEqual(result.ungroupedOrder, ["a", "new", "b"]);
  });

  it("leaves an absent id unchanged", () => {
    const initial = layout({ ungroupedOrder: ["a", "new"] });
    strictEqual(remapAgentIdOp(initial, "old", "new"), initial);
  });

  it("removes a duplicate when the new id is already present", () => {
    const result = remapAgentIdOp(
      layout({
        groups: [
          {
            id: "group",
            name: "Group",
            collapsed: false,
            agentIds: ["old", "new"],
          },
        ],
        ungroupedOrder: ["new", "old"],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["new"]);
    deepStrictEqual(result.ungroupedOrder, []);
  });

  it("removes an existing new id from another section", () => {
    const result = remapAgentIdOp(
      layout({
        groups: [
          {
            id: "group",
            name: "Group",
            collapsed: false,
            agentIds: ["old"],
          },
        ],
        ungroupedOrder: ["new"],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["new"]);
    deepStrictEqual(result.ungroupedOrder, []);
  });
});

/**
 * The overlay upsert (C13). On a server-teams host `sidebar_layout` is a
 * per-user ORDERING OVERLAY keyed by SERVER team id and it starts with no
 * entries at all, so the ops below have to MINT the entry they are asked to
 * write, not just match one. The other half of every case here is the local
 * guarantee: locally every team in the rail comes out of `layout.groups`
 * (`resolveTeams`), so no id can miss and the upsert is unreachable — asserted
 * directly rather than assumed.
 */
describe("moveItemOp upserts the destination group by id", () => {
  it("mints a blank group for an id the layout does not hold", () => {
    const result = moveItemOp(layout({}), "a", {
      groupId: "team_srv",
      beforeItemId: null,
    });
    deepStrictEqual(result.groups, [
      { id: "team_srv", name: "", collapsed: false, agentIds: ["a"] },
    ]);
    // The old fallback dumped it here, where a server host reads nothing.
    deepStrictEqual(result.ungroupedOrder, []);
  });

  it("records the drop POSITION inside a minted group", () => {
    const first = moveItemOp(layout({ ungroupedOrder: ["a", "b"] }), "a", {
      groupId: "team_srv",
      beforeItemId: null,
    });
    const second = moveItemOp(first, "b", {
      groupId: "team_srv",
      beforeItemId: "a",
    });
    deepStrictEqual(second.groups[0]?.agentIds, ["b", "a"]);
  });

  it("mints nothing when the group already exists (the local backend)", () => {
    const initial = layout({
      groups: [group("grp_1", ["a"]), group("grp_2", [])],
      ungroupedOrder: ["b"],
    });
    const result = moveItemOp(initial, "b", {
      groupId: "grp_2",
      beforeItemId: null,
    });
    strictEqual(result.groups.length, 2);
    deepStrictEqual(result.groups[0], group("grp_1", ["a"]));
    deepStrictEqual(result.groups[1], group("grp_2", ["b"]));
    deepStrictEqual(result.ungroupedOrder, []);
  });

  it("still routes the default section to ungroupedOrder", () => {
    const result = moveItemOp(
      layout({ groups: [group("grp_1", ["a"])] }),
      "a",
      {
        groupId: null,
        beforeItemId: null,
      },
    );
    deepStrictEqual(result.groups[0]?.agentIds, []);
    deepStrictEqual(result.ungroupedOrder, ["a"]);
  });
});

describe("toggleGroupCollapsedOp upserts by id", () => {
  it("collapses a group the layout has never seen", () => {
    const result = toggleGroupCollapsedOp(layout({}), "team_srv");
    deepStrictEqual(result.groups, [
      { id: "team_srv", name: "", collapsed: true, agentIds: [] },
    ]);
  });

  it("expands it again on the second toggle", () => {
    const once = toggleGroupCollapsedOp(layout({}), "team_srv");
    const twice = toggleGroupCollapsedOp(once, "team_srv");
    strictEqual(twice.groups[0]?.collapsed, false);
    strictEqual(twice.groups.length, 1);
  });

  it("mints nothing when the group already exists (the local backend)", () => {
    const initial = layout({ groups: [group("grp_1", ["a"])] });
    const result = toggleGroupCollapsedOp(initial, "grp_1");
    deepStrictEqual(result, {
      groups: [{ ...group("grp_1", ["a"]), collapsed: true }],
      ungroupedOrder: [],
    });
  });
});
