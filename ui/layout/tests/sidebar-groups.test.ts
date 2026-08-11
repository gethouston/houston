import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  computeSidebarSections,
  type SidebarGroupView,
} from "../src/sidebar-groups.ts";

const item = (id: string) => ({ id, name: id });
const group = (
  id: string,
  itemIds: string[],
  collapsed = false,
): SidebarGroupView => ({ id, name: id, collapsed, itemIds });

const ids = (items: { id: string }[]) => items.map((it) => it.id);

describe("computeSidebarSections", () => {
  it("puts everything in the trailing default section when there are no groups", () => {
    const items = [item("a"), item("b"), item("c")];
    const sections = computeSidebarSections(items, []);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].groupId, null);
    assert.equal(sections[0].group, null);
    assert.deepEqual(ids(sections[0].items), ["a", "b", "c"]);
  });

  it("resolves group items in itemIds order and leaves ungrouped in items order", () => {
    const items = [item("a"), item("b"), item("c"), item("d")];
    const groups = [group("g1", ["c", "a"])];
    const sections = computeSidebarSections(items, groups);
    // group section first, then trailing default
    assert.equal(sections.length, 2);
    assert.equal(sections[0].groupId, "g1");
    assert.deepEqual(ids(sections[0].items), ["c", "a"]);
    assert.equal(sections[1].groupId, null);
    assert.deepEqual(ids(sections[1].items), ["b", "d"]);
  });

  it("keeps group display order", () => {
    const items = [item("a"), item("b")];
    const sections = computeSidebarSections(items, [
      group("g2", ["b"]),
      group("g1", ["a"]),
    ]);
    assert.deepEqual(
      sections.map((s) => s.groupId),
      ["g2", "g1", null],
    );
  });

  it("skips itemIds that match no item", () => {
    const items = [item("a")];
    const sections = computeSidebarSections(items, [
      group("g1", ["ghost", "a"]),
    ]);
    assert.deepEqual(ids(sections[0].items), ["a"]);
    assert.deepEqual(ids(sections[1].items), []);
  });

  it("always appends the default section even when empty", () => {
    const items = [item("a")];
    const sections = computeSidebarSections(items, [group("g1", ["a"])]);
    assert.equal(sections.at(-1)?.groupId, null);
    assert.deepEqual(ids(sections.at(-1)?.items ?? []), []);
  });

  it("assigns an item to only the first group listing it (never duplicated)", () => {
    const items = [item("a"), item("b")];
    const sections = computeSidebarSections(items, [
      group("g1", ["a"]),
      group("g2", ["a", "b"]),
    ]);
    assert.deepEqual(ids(sections[0].items), ["a"]);
    assert.deepEqual(ids(sections[1].items), ["b"]);
    // "a" is grouped, so it must not fall back into the default section.
    assert.deepEqual(ids(sections[2].items), []);
  });
});
