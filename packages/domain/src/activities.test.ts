import type { ActivityContributor } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  normalizeActivities,
  saveActivities,
} from "./activities";
import { upsertContributor } from "./contributors";
import { docKey } from "./layout";
import type { TextStore } from "./store";

/** Tiny in-memory TextStore (mirrors domain.test.ts). */
function memStore(): TextStore & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    async readText(key) {
      return m.get(key) ?? null;
    },
    async writeText(key, content) {
      m.set(key, content);
    },
    dump: () => m,
  };
}

const ROOT = "ws/w1/a1/workspace";
const NOW = "2026-06-12T12:00:00.000Z";
const ALICE: ActivityContributor = { user_id: "u-alice", name: "Alice" };

test("createActivity with author stamps created_by + single-entry contributors", () => {
  const a = createActivity({ title: "Deck" }, "act-1", NOW, ALICE);
  expect(a.created_by).toBe("u-alice");
  expect(a.contributors).toEqual([{ user_id: "u-alice", name: "Alice" }]);
  // author is copied, not aliased
  expect(a.contributors?.[0]).not.toBe(ALICE);
});

test("createActivity author without name omits the name key", () => {
  const a = createActivity({ title: "Deck" }, "act-1", NOW, {
    user_id: "u-bob",
  });
  expect(a.created_by).toBe("u-bob");
  expect(a.contributors).toEqual([{ user_id: "u-bob" }]);
  expect("name" in (a.contributors?.[0] ?? {})).toBe(false);
});

test("createActivity without author is byte-identical to the single-player shape", () => {
  const a = createActivity({ title: "Deck", description: "Q2" }, "act-1", NOW);
  expect(a).toEqual({
    id: "act-1",
    title: "Deck",
    description: "Q2",
    status: "running",
    updated_at: NOW,
  });
  expect("created_by" in a).toBe(false);
  expect("contributors" in a).toBe(false);
});

test("upsertContributor appends a new contributor", () => {
  const a = createActivity({ title: "T" }, "a1", NOW, ALICE);
  const next = upsertContributor(a, { user_id: "u-bob", name: "Bob" });
  expect(next.contributors).toEqual([
    { user_id: "u-alice", name: "Alice" },
    { user_id: "u-bob", name: "Bob" },
  ]);
});

test("upsertContributor creates the array when missing", () => {
  const a = createActivity({ title: "T" }, "a1", NOW);
  const next = upsertContributor(a, ALICE);
  expect(next.contributors).toEqual([{ user_id: "u-alice", name: "Alice" }]);
});

test("upsertContributor dedups by user_id and updates name in place", () => {
  const a = createActivity({ title: "T" }, "a1", NOW, {
    user_id: "u-bob",
    name: "Bob",
  });
  const withAlice = upsertContributor(a, ALICE); // append -> [bob, alice]
  const renamed = upsertContributor(withAlice, {
    user_id: "u-bob",
    name: "Bobby",
  });
  expect(renamed.contributors).toEqual([
    { user_id: "u-bob", name: "Bobby" }, // same position, new name
    { user_id: "u-alice", name: "Alice" },
  ]);
});

test("upsertContributor returns the same reference when nothing changes", () => {
  const a = createActivity({ title: "T" }, "a1", NOW, ALICE);
  // same user, same name -> no change
  expect(upsertContributor(a, ALICE)).toBe(a);
  // same user, name undefined -> no change (never clears an existing name)
  expect(upsertContributor(a, { user_id: "u-alice" })).toBe(a);
});

test("upsertContributor never touches updated_at", () => {
  const a = createActivity({ title: "T" }, "a1", NOW, ALICE);
  const next = upsertContributor(a, { user_id: "u-bob", name: "Bob" });
  expect(next.updated_at).toBe(NOW);
});

test("applyActivityUpdate with author records the actor as a contributor", () => {
  const a = createActivity({ title: "T" }, "a1", NOW, ALICE);
  const next = applyActivityUpdate(
    a,
    { status: "done" },
    "2026-06-13T00:00:00.000Z",
    { user_id: "u-bob", name: "Bob" },
  );
  expect(next.status).toBe("done");
  expect(next.updated_at).toBe("2026-06-13T00:00:00.000Z");
  expect(next.contributors).toEqual([
    { user_id: "u-alice", name: "Alice" },
    { user_id: "u-bob", name: "Bob" },
  ]);
});

test("applyActivityUpdate without author leaves contributors untouched", () => {
  const a = createActivity({ title: "T" }, "a1", NOW, ALICE);
  const next = applyActivityUpdate(a, { status: "done" }, NOW);
  expect(next.contributors).toEqual([{ user_id: "u-alice", name: "Alice" }]);
});

test("normalize sanitizes attribution: malformed dropped, valid preserved", () => {
  const { items } = normalizeActivities(
    [
      {
        id: "a1",
        title: "T",
        status: "running",
        description: "",
        created_by: "u-alice",
        contributors: [
          { user_id: "u-alice", name: "Alice" },
          { user_id: "u-bob" }, // valid, no name
          { user_id: 42 }, // bad user_id -> dropped
          { name: "orphan" }, // no user_id -> dropped
          "nope", // not an object -> dropped
          { user_id: "u-cara", name: 7 }, // bad name -> name stripped
        ],
      },
      {
        id: "a2",
        title: "T2",
        status: "running",
        description: "",
        created_by: 123, // non-string -> dropped
        contributors: "not-an-array", // non-array -> dropped
      },
    ],
    "k",
  );
  expect(items[0]?.created_by).toBe("u-alice");
  expect(items[0]?.contributors).toEqual([
    { user_id: "u-alice", name: "Alice" },
    { user_id: "u-bob" },
    { user_id: "u-cara" },
  ]);
  expect("created_by" in (items[1] ?? {})).toBe(false);
  expect("contributors" in (items[1] ?? {})).toBe(false);
});

test("attribution survives a save → load round-trip", async () => {
  const store = memStore();
  const a = createActivity({ title: "Deck" }, "act-1", NOW, ALICE);
  await saveActivities(store, ROOT, [a]);
  const { items, diagnostics } = await loadActivities(store, ROOT);
  expect(diagnostics).toEqual([]);
  expect(items).toEqual([a]);
});

test("a load round-trip strips malformed contributors from disk", async () => {
  const store = memStore();
  await store.writeText(
    docKey(ROOT, "activity"),
    JSON.stringify([
      {
        id: "act-1",
        title: "Deck",
        status: "running",
        description: "",
        contributors: [{ user_id: "u-alice", name: "Alice" }, { bogus: true }],
      },
    ]),
  );
  const { items } = await loadActivities(store, ROOT);
  expect(items[0]?.contributors).toEqual([
    { user_id: "u-alice", name: "Alice" },
  ]);
});
