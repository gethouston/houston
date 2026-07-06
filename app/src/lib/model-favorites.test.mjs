import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_RECENTS,
  parseIdList,
  pushToFront,
  toggleInList,
} from "./model-favorites-core.ts";

test("toggleInList: adds an absent id to the end", () => {
  assert.deepEqual(toggleInList(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(toggleInList([], "a"), ["a"]);
});

test("toggleInList: removes a present id, preserving order of the rest", () => {
  assert.deepEqual(toggleInList(["a", "b", "c"], "b"), ["a", "c"]);
  assert.deepEqual(toggleInList(["a"], "a"), []);
});

test("toggleInList: does not mutate its input", () => {
  const input = ["a", "b"];
  toggleInList(input, "c");
  assert.deepEqual(input, ["a", "b"]);
});

test("pushToFront: moves a new id to the front", () => {
  assert.deepEqual(pushToFront(["a", "b"], "c"), ["c", "a", "b"]);
  assert.deepEqual(pushToFront([], "a"), ["a"]);
});

test("pushToFront: dedupes an existing id to the front", () => {
  assert.deepEqual(pushToFront(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(pushToFront(["a", "b"], "a"), ["a", "b"]);
});

test("pushToFront: caps the list at max (default 4)", () => {
  assert.equal(DEFAULT_MAX_RECENTS, 4);
  assert.deepEqual(pushToFront(["a", "b", "c", "d"], "e"), [
    "e",
    "a",
    "b",
    "c",
  ]);
  assert.deepEqual(pushToFront(["a", "b"], "c", 2), ["c", "a"]);
});

test("pushToFront: a non-positive max yields an empty list", () => {
  assert.deepEqual(pushToFront(["a", "b"], "c", 0), []);
});

test("parseIdList: unset preference (null / empty string) is []", () => {
  assert.deepEqual(parseIdList(null), []);
  assert.deepEqual(parseIdList(""), []);
});

test("parseIdList: a JSON string array round-trips", () => {
  assert.deepEqual(parseIdList('["a","b"]'), ["a", "b"]);
});

test("parseIdList: garbage / non-array JSON collapses to []", () => {
  assert.deepEqual(parseIdList("not json"), []);
  assert.deepEqual(parseIdList('{"a":1}'), []);
  assert.deepEqual(parseIdList("42"), []);
});

test("parseIdList: non-string entries are dropped", () => {
  assert.deepEqual(parseIdList('["a",1,null,"b"]'), ["a", "b"]);
});

test("concurrent toggles: threading each result forward keeps both (no lost update)", () => {
  // The race fix makes `useModelFavorites` serialize its mutations and read each
  // base from the live query cache, so a second toggle sees the first's result.
  // Threaded like that, two rapid toggles stack:
  const base = [];
  const afterA = toggleInList(base, "a");
  const afterB = toggleInList(afterA, "b");
  assert.deepEqual(afterB, ["a", "b"]);
  // Contrast — the pre-fix bug: two toggles that both read the SAME stale base
  // (a preferences read-modify-write with no serialization) lose the first.
  const staleB = toggleInList(base, "b");
  assert.deepEqual(
    staleB,
    ["b"],
    "second write clobbers the first without threading",
  );
});
