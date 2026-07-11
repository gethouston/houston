import assert from "node:assert/strict";
import test from "node:test";
import {
  containerDndId,
  containerOfItem,
  containerOfOverId,
  groupDndId,
  itemDndId,
  itemMoveDest,
  moveItemInWorking,
  placeItem,
  rawGroupId,
  rawItemId,
  toWorkingSections,
  type WorkingSection,
} from "../src/sidebar-dnd.ts";

const item = (id: string) => ({ id, name: id });

function working(): WorkingSection[] {
  return [
    { groupId: "g1", itemIds: ["a", "b"] },
    { groupId: null, itemIds: ["c", "d"] },
  ];
}

test("id encode / decode round-trips and namespaces", () => {
  assert.equal(rawItemId(itemDndId("a")), "a");
  assert.equal(rawGroupId(groupDndId("g1")), "g1");
  assert.equal(rawItemId(groupDndId("g1")), null);
  assert.equal(rawGroupId(itemDndId("a")), null);
  assert.equal(rawItemId(containerDndId("g1")), null);
});

test("containerOfItem finds the holder", () => {
  assert.equal(containerOfItem(working(), "a"), "g1");
  assert.equal(containerOfItem(working(), "c"), null); // default section
  assert.equal(containerOfItem(working(), "zzz"), undefined);
});

test("containerOfOverId resolves container / item / default", () => {
  const w = working();
  assert.equal(containerOfOverId(w, containerDndId("g1")), "g1");
  assert.equal(containerOfOverId(w, containerDndId(null)), null);
  assert.equal(containerOfOverId(w, itemDndId("b")), "g1");
  assert.equal(containerOfOverId(w, itemDndId("c")), null);
});

test("moveItemInWorking: reorder within a group (before target)", () => {
  const next = moveItemInWorking(working(), "b", "g1", "a");
  assert.deepEqual(next[0].itemIds, ["b", "a"]);
  assert.deepEqual(next[1].itemIds, ["c", "d"]);
});

test("moveItemInWorking: move across groups, appears exactly once", () => {
  const next = moveItemInWorking(working(), "a", null, "d");
  assert.deepEqual(next[0].itemIds, ["b"]);
  assert.deepEqual(next[1].itemIds, ["c", "a", "d"]);
});

test("moveItemInWorking: null over appends to target container", () => {
  const next = moveItemInWorking(working(), "a", null, null);
  assert.deepEqual(next[1].itemIds, ["c", "d", "a"]);
});

test("placeItem: within-container drag DOWN lands AFTER the over item", () => {
  const w = [{ groupId: null, itemIds: ["a", "b", "c"] }];
  // Drag a down onto c → order becomes b, c, a (a after c), not b, a, c.
  const next = placeItem(w, "a", null, "c");
  assert.deepEqual(next[0].itemIds, ["b", "c", "a"]);
});

test("placeItem: within-container drag UP lands BEFORE the over item", () => {
  const w = [{ groupId: null, itemIds: ["a", "b", "c"] }];
  const next = placeItem(w, "c", null, "a");
  assert.deepEqual(next[0].itemIds, ["c", "a", "b"]);
});

test("placeItem: null over appends within the container", () => {
  const w = [{ groupId: null, itemIds: ["a", "b", "c"] }];
  assert.deepEqual(placeItem(w, "a", null, null)[0].itemIds, ["b", "c", "a"]);
});

test("placeItem: cross-container inserts before the over item", () => {
  const w = working();
  const next = placeItem(w, "a", null, "d"); // a: g1 -> default before d
  assert.deepEqual(next[0].itemIds, ["b"]);
  assert.deepEqual(next[1].itemIds, ["c", "a", "d"]);
});

test("itemMoveDest: beforeItemId is the following sibling, null when last", () => {
  const w = [{ groupId: "g1", itemIds: ["a", "b", "c"] }];
  assert.deepEqual(itemMoveDest(w, "a"), { groupId: "g1", beforeItemId: "b" });
  assert.deepEqual(itemMoveDest(w, "c"), { groupId: "g1", beforeItemId: null });
  assert.equal(itemMoveDest(w, "zzz"), null);
});

test("toWorkingSections strips item content to ids", () => {
  const sections = [
    { groupId: "g1", group: null, items: [item("a"), item("b")] },
    { groupId: null, group: null, items: [item("c")] },
  ];
  assert.deepEqual(toWorkingSections(sections), [
    { groupId: "g1", itemIds: ["a", "b"] },
    { groupId: null, itemIds: ["c"] },
  ]);
});
