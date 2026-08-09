import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston-ai/engine-client";
import {
  expandOnlyTeamOp,
  moveItemOp,
  normalizeSidebarLayout,
  remapAgentIdOp,
  setDefaultContextOp,
  setGroupIdentityOp,
  toggleDefaultCollapsedOp,
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

/**
 * The DEFAULT team's fold state. Every NAMED team is a stored group with its
 * own `collapsed`; the default team is VIRTUAL (it IS the workspace) and owns
 * no group row, so the flag lives on the layout. It is ADDITIVE, so the cases
 * below pin that absent stays ABSENT rather than becoming `false` — a layout
 * written before the field existed has to keep normalizing byte-identically.
 */
describe("normalizeSidebarLayout carries defaultCollapsed", () => {
  it("keeps a valid boolean", () => {
    strictEqual(
      normalizeSidebarLayout({
        groups: [],
        ungroupedOrder: [],
        defaultCollapsed: true,
      }).defaultCollapsed,
      true,
    );
    strictEqual(
      normalizeSidebarLayout({
        groups: [],
        ungroupedOrder: [],
        defaultCollapsed: false,
      }).defaultCollapsed,
      false,
    );
  });

  it("drops a wrong-typed value to absent instead of failing the layout", () => {
    const result = normalizeSidebarLayout({
      groups: [group("grp_1", ["a"])],
      ungroupedOrder: ["b"],
      defaultCollapsed: "yes",
    });
    strictEqual("defaultCollapsed" in result, false);
    // Lenient, not strict: the rest of the layout survives.
    deepStrictEqual(result.groups, [group("grp_1", ["a"])]);
    deepStrictEqual(result.ungroupedOrder, ["b"]);
  });

  it("leaves an absent field absent", () => {
    const result = normalizeSidebarLayout({
      groups: [],
      ungroupedOrder: ["a"],
    });
    strictEqual("defaultCollapsed" in result, false);
  });
});

/**
 * The DEFAULT team's shared CONTEXT, additive on the layout for the same reason
 * the fold flag is: the default team owns no group row to hold it. Empty is a
 * real stored value here (the user cleared the box) — only a WRONG-TYPED one
 * decays to absent.
 */
describe("normalizeSidebarLayout carries defaultContext", () => {
  it("keeps a stored string, including an emptied one", () => {
    strictEqual(
      normalizeSidebarLayout({
        groups: [],
        ungroupedOrder: [],
        defaultContext: "We ship daily.",
      }).defaultContext,
      "We ship daily.",
    );
    strictEqual(
      normalizeSidebarLayout({
        groups: [],
        ungroupedOrder: [],
        defaultContext: "",
      }).defaultContext,
      "",
    );
  });

  it("drops a wrong-typed value to absent instead of failing the layout", () => {
    const result = normalizeSidebarLayout({
      groups: [group("grp_1", ["a"])],
      ungroupedOrder: ["b"],
      defaultContext: 42,
    });
    strictEqual("defaultContext" in result, false);
    deepStrictEqual(result.groups, [group("grp_1", ["a"])]);
    deepStrictEqual(result.ungroupedOrder, ["b"]);
  });

  it("leaves an absent field absent", () => {
    strictEqual(
      "defaultContext" in
        normalizeSidebarLayout({ groups: [], ungroupedOrder: [] }),
      false,
    );
  });
});

/**
 * A team's glyph + color, the LOCAL half of the identity C13 stores
 * server-side. Three states, spelled as the wire spells them except for the
 * clear: a string SETS, `null` CLEARS (the wire's `""`, which a stored layout
 * has no serialisation reason to borrow), an omitted key is UNTOUCHED. A clear
 * removes the KEY — absent means "render your own default", which is a
 * different instruction from an empty string the user never chose.
 */
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
      ungroupedOrder: [],
    });
    strictEqual(result.groups[0]?.icon, "rocket");
    strictEqual(result.groups[0]?.color, "#5E6AD2");
  });

  it("drops a wrong-typed icon to absent, keeping the group", () => {
    const result = normalizeSidebarLayout({
      groups: [{ ...group("grp_1", ["a"]), icon: 7, color: "#5E6AD2" }],
      ungroupedOrder: ["b"],
    });
    // Lenient, not strict: the group survives with the icon simply absent —
    // never `""`, which would be an identity the user never chose.
    strictEqual("icon" in (result.groups[0] as object), false);
    strictEqual(result.groups[0]?.color, "#5E6AD2");
    deepStrictEqual(result.groups[0]?.agentIds, ["a"]);
  });

  it("leaves both absent when the stored group predates identity", () => {
    const result = normalizeSidebarLayout({
      groups: [group("grp_1", ["a"])],
      ungroupedOrder: [],
    });
    deepStrictEqual(result.groups[0], group("grp_1", ["a"]));
  });
});

describe("toggleDefaultCollapsedOp", () => {
  it("folds the default team shut when the flag is absent", () => {
    strictEqual(toggleDefaultCollapsedOp(layout({})).defaultCollapsed, true);
  });

  it("expands it again from true", () => {
    strictEqual(
      toggleDefaultCollapsedOp(layout({ defaultCollapsed: true }))
        .defaultCollapsed,
      false,
    );
  });

  it("folds it from an explicit false", () => {
    strictEqual(
      toggleDefaultCollapsedOp(layout({ defaultCollapsed: false }))
        .defaultCollapsed,
      true,
    );
  });

  it("does not mutate its input and disturbs nothing else", () => {
    const initial = layout({
      groups: [group("grp_1", ["a"])],
      ungroupedOrder: ["b"],
    });
    const result = toggleDefaultCollapsedOp(initial);
    strictEqual("defaultCollapsed" in initial, false);
    deepStrictEqual(result, {
      groups: [group("grp_1", ["a"])],
      ungroupedOrder: ["b"],
      defaultCollapsed: true,
    });
  });
});

/**
 * `setGroupContextOp` for the team that owns no group row. The host reads the
 * result and mirrors it into every UNGROUPED agent's `GROUP.md`, so what this op
 * writes is what a whole team is told — and it must never disturb a NAMED team's
 * own context on the way past.
 */
describe("setDefaultContextOp", () => {
  it("writes the default team's context onto the layout", () => {
    strictEqual(
      setDefaultContextOp(layout({}), "We ship daily.").defaultContext,
      "We ship daily.",
    );
  });

  it("stores an emptied box as an empty string, not an absent key", () => {
    // One spelling of cleared: the host trims, so blank and absent are the same
    // state downstream and both delete the mirror file.
    strictEqual(
      setDefaultContextOp(layout({ defaultContext: "old" }), "").defaultContext,
      "",
    );
  });

  it("replaces an existing context", () => {
    strictEqual(
      setDefaultContextOp(layout({ defaultContext: "old" }), "new")
        .defaultContext,
      "new",
    );
  });

  it("does not mutate its input and leaves named teams untouched", () => {
    const named = { ...group("grp_1", ["a"]), context: "Team text." };
    const initial = layout({ groups: [named], ungroupedOrder: ["b"] });
    const result = setDefaultContextOp(initial, "Default text.");
    strictEqual("defaultContext" in initial, false);
    deepStrictEqual(result, {
      groups: [named],
      ungroupedOrder: ["b"],
      defaultContext: "Default text.",
    });
  });
});

describe("expandOnlyTeamOp", () => {
  // The rail's accordion: opening a team the user was not in folds every other
  // one. It has to be ONE layout, because it is one click — N toggles would
  // fire N PUTs racing each other through the same optimistic cache.
  const three = layout({
    groups: [
      { ...group("t1", ["a"]), collapsed: true },
      { ...group("t2", ["b"]), collapsed: false },
      { ...group("t3", ["c"]), collapsed: false },
    ],
    defaultCollapsed: false,
  });
  const ids = ["t1", "t2", "t3"];

  it("opens the named team and folds every other, in one layout", () => {
    const next = expandOnlyTeamOp(three, {
      teamId: "t1",
      isDefault: false,
      namedTeamIds: ids,
    });
    deepStrictEqual(
      next.groups.map((g) => [g.id, g.collapsed]),
      [
        ["t1", false],
        ["t2", true],
        ["t3", true],
      ],
    );
    // The DEFAULT team owns no group row, so its fold is the layout's own flag.
    strictEqual(next.defaultCollapsed, true);
  });

  it("opens the DEFAULT team the same way, folding every named one", () => {
    const next = expandOnlyTeamOp(three, {
      teamId: "team:default",
      isDefault: true,
      namedTeamIds: ids,
    });
    strictEqual(next.defaultCollapsed, false);
    strictEqual(
      next.groups.every((g) => g.collapsed),
      true,
    );
  });

  it("upserts a team the overlay has never seen", () => {
    // A server host's overlay starts EMPTY, so the first accordion click names
    // ids the layout does not hold yet.
    const next = expandOnlyTeamOp(layout({}), {
      teamId: "t2",
      isDefault: false,
      namedTeamIds: ids,
    });
    deepStrictEqual(
      next.groups.map((g) => [g.id, g.collapsed, g.name]),
      [
        ["t1", true, ""],
        ["t2", false, ""],
        ["t3", true, ""],
      ],
    );
  });

  it("carries a group the rail is NOT drawing through untouched", () => {
    // Another surface's row, or an overlay entry for a team someone else
    // deleted. Neither is this click's business; rule 7's decay retires them.
    const stale = { ...group("gone", ["z"]), context: "the brand" };
    const next = expandOnlyTeamOp(
      layout({ groups: [...three.groups, stale] }),
      { teamId: "t1", isDefault: false, namedTeamIds: ids },
    );
    strictEqual(
      next.groups.find((g) => g.id === "gone"),
      stale,
    );
  });

  it("does not mutate the layout it was handed", () => {
    const before = structuredClone(three);
    expandOnlyTeamOp(three, {
      teamId: "t1",
      isDefault: false,
      namedTeamIds: ids,
    });
    deepStrictEqual(three, before);
  });
});
