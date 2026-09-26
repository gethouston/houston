import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createSidebarAccessibility,
  keyboardMoveAnnouncement,
} from "../src/sidebar-drag-accessibility.ts";
import type { SidebarTreeRow } from "../src/sidebar-tree.ts";

test("drag announcements use names and supplied words", () => {
  const accessibility = createSidebarAccessibility(
    [{ id: "a", name: "Ana" }],
    [{ id: "g", name: "Finance", itemIds: [], collapsed: false }],
    {
      dragPickedUp: "Tomaste %name%",
      dragMovedOver: "%name% sobre %over%",
      dragDropped: "Soltaste %name% sobre %over%",
      dragCancelled: "Cancelaste %name%",
      dragInstructions: "Arrastra con el puntero",
    },
  );
  assert.equal(
    accessibility.announcements?.onDragStart({
      active: { id: "agent:a" },
    } as never),
    "Tomaste Ana",
  );
  assert.equal(
    accessibility.announcements?.onDragOver({
      active: { id: "agent:a" },
      over: { id: "group:g" },
    } as never),
    "Ana sobre Finance",
  );
  assert.equal(
    accessibility.screenReaderInstructions?.draggable,
    "Arrastra con el puntero",
  );
});

test("drag listener types come from public dnd-kit exports", () => {
  for (const name of [
    "sidebar-item-row.tsx",
    "sidebar-group-header.tsx",
    "sidebar-row-button.tsx",
  ]) {
    const source = readFileSync(
      new URL(`../src/${name}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /@dnd-kit\/core\/dist\//, name);
  }
});

test("the README names only SidebarGroupHeader props that exist", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(
    readme,
    /`menu` render prop|inline rename through `rename`/,
  );
});

test("showcase names the ungrouped top-level agents", () => {
  const source = readFileSync(
    new URL(
      "../../showcase/specimens/areas/agents/app-sidebar.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /default block/);
});

test("a keyboard move names the group entered or left, or the top level", () => {
  const items = ["a", "b", "x"].map((id) => ({ id, name: id.toUpperCase() }));
  const groups = [
    { id: "g", name: "Finance", itemIds: ["x"], collapsed: false },
  ];
  const top = (id: string): SidebarTreeRow => ({
    kind: "agent",
    id,
    parentId: null,
  });
  const member = (id: string): SidebarTreeRow => ({
    kind: "agent",
    id,
    parentId: "g",
  });
  const header: SidebarTreeRow = { kind: "group", id: "g", collapsed: false };
  const before = [top("a"), top("b"), header, member("x")];
  const say = (after: SidebarTreeRow[], key: string, from = before) =>
    keyboardMoveAnnouncement(from, after, key, items, groups);
  assert.equal(
    say([top("b"), top("a"), header, member("x")], "agent:a"),
    "Moved A to position 2 at the top level.",
  );
  const entered = [top("a"), header, member("b"), member("x")];
  assert.equal(say(entered, "agent:b"), "Moved B into Finance.");
  assert.equal(
    say([top("a"), header, member("x"), member("b")], "agent:b", entered),
    "Moved B to position 2 in Finance.",
  );
  assert.equal(
    say([top("a"), header, top("b"), member("x")], "agent:b", entered),
    "Moved B out of Finance, to the top level.",
  );
  assert.equal(
    say([header, member("x"), top("a"), top("b")], "group:g"),
    "Moved Finance to position 1 at the top level.",
  );
});
