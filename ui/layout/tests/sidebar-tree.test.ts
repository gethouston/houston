import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeSidebarSections,
  type SidebarGroupView,
  type SidebarRootEntry,
} from "../src/sidebar-groups.ts";
import type { SidebarItem } from "../src/sidebar-props.ts";
import {
  arrangementFromRows,
  flattenSidebar,
  keyboardSidebarStep,
  projectSidebarDrop,
  type SidebarTreeRow,
} from "../src/sidebar-tree.ts";

// Rail: A, B, [G: x, y], C   (and a collapsed group K holding z, at the end)
const items: SidebarItem[] = ["A", "B", "C", "x", "y", "z"].map((id) => ({
  id,
  name: id,
}));
const group = (
  id: string,
  itemIds: string[],
  collapsed = false,
): SidebarGroupView => ({ id, name: id, collapsed, itemIds });
const groups = [group("G", ["x", "y"]), group("K", ["z"], true)];
const order: SidebarRootEntry[] = [
  { kind: "agent", id: "A" },
  { kind: "agent", id: "B" },
  { kind: "group", id: "G" },
  { kind: "agent", id: "C" },
  { kind: "group", id: "K" },
];
const sections = computeSidebarSections(items, groups, order);
const rows = flattenSidebar(sections, false);
const hidden = { K: ["z"] };

/** Render a row list the way the rail reads: members indented with ">". */
const draw = (list: SidebarTreeRow[] | null) =>
  list
    ?.map((row) =>
      row.kind === "group"
        ? `[${row.id}]`
        : row.parentId
          ? `>${row.id}`
          : row.id,
    )
    .join(" ");

const drop = (active: string, over: string, depthDelta = 0) =>
  projectSidebarDrop(rows, active, over, depthDelta);

test("flatten: one row per visible line, members only for open groups", () => {
  assert.equal(draw(rows), "A B [G] >x >y C [K]");
  assert.equal(draw(flattenSidebar(sections, "G")), "A B [G] C [K]");
});

test("group drag keeps other open groups' member geometry", () => {
  const other = computeSidebarSections(
    items,
    [group("G", ["x"]), group("K", ["y"])],
    order,
  );
  assert.equal(draw(flattenSidebar(other, "G")), "z A B [G] C [K] >y");
});

test("group drop skips member runs in both directions", () => {
  const two = computeSidebarSections(
    items,
    [group("G", ["x"]), group("K", ["y"])],
    order,
  );
  const visible = flattenSidebar(two, "G");
  assert.equal(
    draw(projectSidebarDrop(visible, "group:G", "agent:y", 0)),
    "z A B C [K] >y [G]",
  );
  const reverse = flattenSidebar(two, "K");
  assert.equal(
    draw(projectSidebarDrop(reverse, "group:K", "agent:x", 0)),
    "z A B [K] [G] >x C",
  );
});

test("keyboard steps use the same projected rows and preserve group membership", () => {
  assert.equal(
    draw(keyboardSidebarStep(rows, "agent:A", "down")),
    "B A [G] >x >y C [K]",
  );
  assert.equal(
    draw(keyboardSidebarStep(rows, "agent:C", "up")),
    "A B [G] >x >C >y [K]",
  );
  assert.equal(
    draw(keyboardSidebarStep(rows, "agent:C", "right")),
    "A B [G] >x >y >C [K]",
  );
  assert.equal(
    draw(keyboardSidebarStep(rows, "agent:y", "left")),
    "A B [G] >x y C [K]",
  );
});

test("position 0 to position 2: every slot is reachable", () => {
  assert.equal(draw(drop("agent:A", "group:G")), "B [G] >A >x >y C [K]");
  assert.equal(draw(drop("agent:A", "agent:B")), "B A [G] >x >y C [K]");
});

test("dropping above a member always lands inside the group", () => {
  assert.equal(draw(drop("agent:C", "agent:x")), "A B [G] >C >x >y [K]");
  assert.equal(draw(drop("agent:C", "agent:x", -3)), "A B [G] >C >x >y [K]");
});

test("after the last member: stay inside, drag left to leave", () => {
  assert.equal(draw(drop("agent:x", "agent:y")), "A B [G] >y >x C [K]");
  assert.equal(draw(drop("agent:x", "agent:y", -1)), "A B [G] >y x C [K]");
});

test("a top-level agent after a group joins it only when dragged right", () => {
  assert.equal(draw(drop("agent:C", "agent:C")), "A B [G] >x >y C [K]");
  assert.equal(draw(drop("agent:C", "agent:C", 1)), "A B [G] >x >y >C [K]");
});

test("a collapsed group takes an agent dragged right onto its slot", () => {
  const into = drop("agent:A", "group:K", 1);
  assert.equal(draw(into), "B [G] >x >y C [K] >A");
  assert.deepEqual(arrangementFromRows(into ?? [], hidden).members.K, [
    "z",
    "A",
  ]);
  assert.equal(draw(drop("agent:A", "group:K")), "B [G] >x >y C [K] A");
});

test("the first slot is always top level", () => {
  assert.equal(draw(drop("agent:x", "agent:A", 2)), "x A B [G] >y C [K]");
});

test("groups only reorder, among headers and top-level agents", () => {
  const groupRows = flattenSidebar(sections, "G");
  const moved = projectSidebarDrop(groupRows, "group:G", "agent:A", 1);
  assert.equal(draw(moved), "[G] A B C [K]");
  const stored = arrangementFromRows(moved ?? [], { G: ["x", "y"], K: ["z"] });
  assert.deepEqual(stored.members, { G: ["x", "y"], K: ["z"] });
  assert.deepEqual(stored.order.slice(0, 2), [
    { kind: "group", id: "G" },
    { kind: "agent", id: "A" },
  ]);
});

test("the arrangement is read straight off the landed rows", () => {
  const landed = drop("agent:x", "agent:C", -1);
  assert.equal(draw(landed), "A B [G] >y C x [K]");
  assert.deepEqual(arrangementFromRows(landed ?? [], hidden), {
    order: [
      { kind: "agent", id: "A" },
      { kind: "agent", id: "B" },
      { kind: "group", id: "G" },
      { kind: "agent", id: "C" },
      { kind: "agent", id: "x" },
      { kind: "group", id: "K" },
    ],
    members: { G: ["y"], K: ["z"] },
  });
});

test("unknown keys resolve to no drop", () => {
  assert.equal(drop("agent:nope", "agent:A"), null);
  assert.equal(drop("agent:A", "agent:nope"), null);
});

// Rail: A, B (never arranged, so first), [G: x, y], [K collapsed: z], C
const pastFold = flattenSidebar(
  computeSidebarSections(items, groups, [
    { kind: "group", id: "G" },
    { kind: "group", id: "K" },
    { kind: "agent", id: "C" },
  ]),
);

test("keyboard Down past a collapsed group lands at the top level after it", () => {
  assert.equal(draw(pastFold), "A B [G] >x >y [K] C");
  const stepped = keyboardSidebarStep(pastFold, "agent:y", "down");
  assert.equal(draw(stepped), "A B [G] >x [K] y C");
  assert.equal(
    draw(keyboardSidebarStep(stepped ?? [], "agent:y", "down")),
    "A B [G] >x [K] C y",
  );
});

test("Alt+Right right after a collapsed group puts the agent at its end", () => {
  const after = keyboardSidebarStep(pastFold, "agent:y", "down") ?? [];
  const inside = keyboardSidebarStep(after, "agent:y", "right");
  assert.equal(draw(inside), "A B [G] >x [K] >y C");
  assert.deepEqual(arrangementFromRows(inside ?? [], hidden).members.K, [
    "z",
    "y",
  ]);
});

test("a pointer drop past a collapsed group enters it only when dragged right", () => {
  assert.equal(
    draw(projectSidebarDrop(pastFold, "agent:x", "group:K", 0)),
    "A B [G] >y [K] x C",
  );
  assert.equal(
    draw(projectSidebarDrop(pastFold, "agent:x", "group:K", 1)),
    "A B [G] >y [K] >x C",
  );
});
