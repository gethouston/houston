import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import {
  arrangeOp,
  createGroupOp,
  createGroupWithIdentityOp,
  DEFAULT_SIDEBAR_LAYOUT,
  deleteGroupOp,
  moveItemOp,
  normalizeSidebarLayout,
  remapAgentIdOp,
  renameGroupOp,
  setGroupIdentityOp,
  toggleGroupCollapsedOp,
} from "../src/lib/sidebar-layout-ops.ts";

const group = (id: string, agentIds: string[]) => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
});
const layout = (over: Partial<SidebarLayout>): SidebarLayout => ({
  groups: [],
  order: [],
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
      layout({
        order: [
          { kind: "agent", id: "a" },
          { kind: "agent", id: "old" },
          { kind: "agent", id: "b" },
        ],
      }),
      "old",
      "new",
    );
    deepStrictEqual(
      result.order.map((entry) => entry.id),
      ["a", "new", "b"],
    );
  });

  it("leaves an absent id unchanged", () => {
    const initial = layout({
      order: [
        { kind: "agent", id: "a" },
        { kind: "agent", id: "new" },
      ],
    });
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
        order: [
          { kind: "agent", id: "new" },
          { kind: "agent", id: "old" },
        ],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["new"]);
    deepStrictEqual(
      result.order.map((entry) => entry.id),
      [],
    );
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
        order: [{ kind: "agent", id: "new" }],
      }),
      "old",
      "new",
    );
    deepStrictEqual(result.groups[0]?.agentIds, ["new"]);
    deepStrictEqual(
      result.order.map((entry) => entry.id),
      [],
    );
  });
});

describe("folder operations", () => {
  it("has an empty default layout", () => {
    deepStrictEqual(DEFAULT_SIDEBAR_LAYOUT, { groups: [], order: [] });
  });

  it("renames only the selected group", () => {
    const initial = layout({ groups: [group("a", []), group("b", [])] });
    const result = renameGroupOp(initial, "b", "Operations");
    deepStrictEqual(
      result.groups.map((item) => item.name),
      ["a", "Operations"],
    );
  });

  it("retains a group's identity while storing a drop", () => {
    const initial = layout({
      groups: [{ ...group("g", ["a", "b"]), name: "Design", collapsed: true }],
      order: [{ kind: "group", id: "g" }],
    });
    const result = arrangeOp(initial, {
      order: [
        { kind: "group", id: "g" },
        { kind: "agent", id: "b" },
      ],
      members: { g: ["a"] },
    });
    strictEqual(result.groups[0].name, "Design");
    strictEqual(result.groups[0].collapsed, true);
    deepStrictEqual(result.groups[0].agentIds, ["a"]);
  });

  it("normalizes absent and malformed layouts", () => {
    deepStrictEqual(normalizeSidebarLayout(undefined), DEFAULT_SIDEBAR_LAYOUT);
    deepStrictEqual(
      normalizeSidebarLayout({ error: "not found" }),
      DEFAULT_SIDEBAR_LAYOUT,
    );
    deepStrictEqual(
      normalizeSidebarLayout({
        groups: [group("valid", ["a"]), { id: "invalid" }, null],
        order: [1, 2],
      }),
      layout({
        groups: [group("valid", ["a"])],
        order: [{ kind: "group", id: "valid" }],
      }),
    );
  });

  it("keeps temporarily unrendered agents in their stored positions", () => {
    const initial = layout({
      groups: [group("g", ["hidden", "visible"])],
      order: [
        { kind: "agent", id: "missing" },
        { kind: "group", id: "g" },
        { kind: "agent", id: "shown" },
      ],
    });
    const result = arrangeOp(initial, {
      order: [
        { kind: "group", id: "g" },
        { kind: "agent", id: "shown" },
      ],
      members: { g: ["visible"] },
    });
    deepStrictEqual(result.groups[0].agentIds, ["hidden", "visible"]);
    deepStrictEqual(result.order, [
      { kind: "agent", id: "missing" },
      { kind: "group", id: "g" },
      { kind: "agent", id: "shown" },
    ]);
  });

  it("keeps an agent whose drop names a group the fresh layout no longer has", () => {
    const initial = layout({
      groups: [group("g", ["a"])],
      order: [
        { kind: "group", id: "g" },
        { kind: "agent", id: "y" },
      ],
    });
    const result = arrangeOp(initial, {
      order: [{ kind: "group", id: "g" }],
      members: { g: ["a"], deleted: ["y"] },
    });
    deepStrictEqual(result.order, [
      { kind: "group", id: "g" },
      { kind: "agent", id: "y" },
    ]);
  });

  it("creates a group with its identity in one layout operation", () => {
    const result = createGroupWithIdentityOp(layout({}), "g", "Design", null, {
      icon: "rocket",
      color: "blue",
    });
    deepStrictEqual(result.groups, [
      { ...group("g", []), name: "Design", icon: "rocket", color: "blue" },
    ]);
  });
  it("creates an empty folder and frees its agents on deletion", () => {
    const created = createGroupOp(
      layout({ order: [{ kind: "agent", id: "c" }] }),
      "g",
      "Design",
    );
    deepStrictEqual(created.groups, [
      { id: "g", name: "Design", collapsed: false, agentIds: [] },
    ]);
    const filled = moveItemOp(
      moveItemOp(created, "a", { groupId: "g", beforeItemId: null }),
      "b",
      { groupId: "g", beforeItemId: null },
    );
    deepStrictEqual(
      deleteGroupOp(filled, "g").order.map((entry) => entry.id),
      ["a", "b", "c"],
    );
  });

  it("moves an agent between folders and No team", () => {
    const initial = layout({
      groups: [group("g", ["b"])],
      order: [{ kind: "agent", id: "a" }],
    });
    const grouped = moveItemOp(initial, "a", {
      groupId: "g",
      beforeItemId: "b",
    });
    deepStrictEqual(grouped.groups[0].agentIds, ["a", "b"]);
    const ungrouped = moveItemOp(grouped, "a", {
      groupId: null,
      beforeItemId: null,
    });
    deepStrictEqual(
      ungrouped.order.map((entry) => entry.id),
      ["a"],
    );
  });

  it("does not invent a folder for an unknown destination or collapse", () => {
    const initial = layout({ order: [{ kind: "agent", id: "a" }] });
    strictEqual(
      moveItemOp(initial, "a", { groupId: "missing", beforeItemId: null }),
      initial,
    );
    strictEqual(toggleGroupCollapsedOp(initial, "missing"), initial);
  });

  it("toggles the stored collapsed flag", () => {
    const initial = layout({ groups: [group("g", [])] });
    strictEqual(toggleGroupCollapsedOp(initial, "g").groups[0].collapsed, true);
  });

  it("normalizes only the pinned wire fields", () => {
    const initial = group("g", ["a"]);
    deepStrictEqual(
      normalizeSidebarLayout({
        groups: [{ ...initial, unsupported: "ignored" }],
        order: [],
        unsupported: true,
      }),
      layout({ groups: [initial], order: [{ kind: "group", id: "g" }] }),
    );
  });
});

describe("setGroupIdentityOp", () => {
  const styled = (over: Partial<SidebarLayout["groups"][number]>) =>
    layout({ groups: [{ ...group("grp_1", ["a"]), ...over }] });

  it("sets the icon alone, leaving the color absent", () => {
    const result = setGroupIdentityOp(styled({}), "grp_1", { icon: "rocket" });
    strictEqual(result.groups[0]?.icon, "rocket");
    strictEqual("color" in (result.groups[0] as object), false);
  });

  it("sets the color alone, leaving the icon absent", () => {
    const result = setGroupIdentityOp(styled({}), "grp_1", {
      color: "#5E6AD2",
    });
    strictEqual(result.groups[0]?.color, "#5E6AD2");
    strictEqual("icon" in (result.groups[0] as object), false);
  });

  it("leaves the other field untouched when only one is patched", () => {
    const result = setGroupIdentityOp(
      styled({ icon: "rocket", color: "indigo-500" }),
      "grp_1",
      { color: "#5E6AD2" },
    );
    strictEqual(result.groups[0]?.icon, "rocket");
    strictEqual(result.groups[0]?.color, "#5E6AD2");
  });

  it("clears one with null while the other survives", () => {
    const result = setGroupIdentityOp(
      styled({ icon: "rocket", color: "indigo-500" }),
      "grp_1",
      { icon: null },
    );
    strictEqual("icon" in (result.groups[0] as object), false);
    strictEqual(result.groups[0]?.color, "indigo-500");
  });

  it("clears both at once", () => {
    const result = setGroupIdentityOp(
      styled({ icon: "rocket", color: "indigo-500" }),
      "grp_1",
      { icon: null, color: null },
    );
    deepStrictEqual(result.groups[0], group("grp_1", ["a"]));
  });

  it("carries every other field of the group through", () => {
    const result = setGroupIdentityOp(
      styled({ collapsed: true, context: "stay concise" }),
      "grp_1",
      { icon: "rocket" },
    );
    strictEqual(result.groups[0]?.collapsed, true);
    strictEqual(result.groups[0]?.context, "stay concise");
    deepStrictEqual(result.groups[0]?.agentIds, ["a"]);
  });

  it("is a no-op for an unknown group id (it never upserts)", () => {
    const initial = styled({});
    const result = setGroupIdentityOp(initial, "team_srv", { icon: "rocket" });
    deepStrictEqual(result.groups, initial.groups);
  });

  it("does not mutate its input", () => {
    const initial = styled({});
    setGroupIdentityOp(initial, "grp_1", { icon: "rocket" });
    strictEqual("icon" in (initial.groups[0] as object), false);
  });
});

describe("normalizeSidebarLayout carries a group's identity", () => {
  it("keeps a valid icon and color", () => {
    const result = normalizeSidebarLayout({
      groups: [{ ...group("grp_1", ["a"]), icon: "rocket", color: "#5E6AD2" }],
      order: [],
    });
    strictEqual(result.groups[0]?.icon, "rocket");
    strictEqual(result.groups[0]?.color, "#5E6AD2");
  });

  it("drops a wrong-typed icon to absent, keeping the group", () => {
    const result = normalizeSidebarLayout({
      groups: [{ ...group("grp_1", ["a"]), icon: 7, color: "#5E6AD2" }],
      order: [{ kind: "agent", id: "b" }],
    });
    // Lenient, not strict: the group survives with the icon simply absent —
    // never `""`, which would be an identity the user never chose.
    strictEqual("icon" in (result.groups[0] as object), false);
    strictEqual(result.groups[0]?.color, "#5E6AD2");
    deepStrictEqual(result.groups[0]?.agentIds, ["a"]);
  });

  it("leaves both absent when the stored group has no identity", () => {
    const result = normalizeSidebarLayout({
      groups: [group("grp_1", ["a"])],
      order: [],
    });
    deepStrictEqual(result.groups[0], group("grp_1", ["a"]));
  });
});
