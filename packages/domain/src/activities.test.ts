import type {
  Activity,
  ActivityContributor,
  PendingInteraction,
} from "@houston/protocol";
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

// ── Manual move to Done: blocking steps go, suggestion offers stay ──────────
// Closing a mission is the user's own move and answers whatever it was waiting
// on, but the clean-finish offers keep rendering on the Done card.

const QUESTION_STEP = {
  kind: "question" as const,
  id: "q1",
  question: "Which deck?",
};
const ACTIONS_STEP = {
  kind: "suggest_actions" as const,
  id: "a1",
  actions: [
    { id: "x", label: "Send it", message: "Send the deck" },
    { id: "y", label: "Draft a note", message: "Draft the note" },
  ],
};
const REUSABLE_STEP = {
  kind: "suggest_reusable" as const,
  id: "r1",
  reusableKind: "skill" as const,
  title: "Weekly deck",
  rationale: "You do this every week.",
};

const withInteraction = (steps: PendingInteraction["steps"]): Activity => ({
  ...createActivity({ title: "T" }, "a1", NOW),
  status: "needs_you",
  pending_interaction: { steps },
});

test("moving to done drops blocking steps and keeps the suggestion offers", () => {
  const next = applyActivityUpdate(
    withInteraction([QUESTION_STEP, ACTIONS_STEP, REUSABLE_STEP]),
    { status: "done" },
    NOW,
  );
  expect(next.status).toBe("done");
  expect(next.pending_interaction).toEqual({
    steps: [ACTIONS_STEP, REUSABLE_STEP],
  });
});

test("moving to done clears the interaction when only blocking steps remain", () => {
  const next = applyActivityUpdate(
    withInteraction([
      QUESTION_STEP,
      { kind: "connect", id: "c1", toolkit: "gmail" },
    ]),
    { status: "done" },
    NOW,
  );
  expect(next.pending_interaction).toBeUndefined();
  expect("pending_interaction" in next).toBe(false);
});

test("moving to done leaves a suggestions-only interaction untouched", () => {
  const next = applyActivityUpdate(
    withInteraction([ACTIONS_STEP]),
    { status: "done" },
    NOW,
  );
  expect(next.pending_interaction).toEqual({ steps: [ACTIONS_STEP] });
});

test("a done patch that carries its own pending_interaction wins", () => {
  const next = applyActivityUpdate(
    withInteraction([QUESTION_STEP, ACTIONS_STEP]),
    { status: "done", pending_interaction: { steps: [REUSABLE_STEP] } },
    NOW,
  );
  expect(next.pending_interaction).toEqual({ steps: [REUSABLE_STEP] });
});

test("a done patch with an explicit null clears the interaction outright", () => {
  const next = applyActivityUpdate(
    withInteraction([ACTIONS_STEP]),
    { status: "done", pending_interaction: null },
    NOW,
  );
  expect(next.pending_interaction).toBeUndefined();
});

test("a non-done patch leaves the pending interaction untouched", () => {
  const steps = [QUESTION_STEP, ACTIONS_STEP];
  for (const status of ["archived", "running", "needs_you", undefined]) {
    const next = applyActivityUpdate(
      withInteraction(steps),
      status === undefined ? { title: "Renamed" } : { status },
      NOW,
    );
    expect(next.pending_interaction).toEqual({ steps });
  }
});

test("moving to done is a no-op when there is no interaction", () => {
  const next = applyActivityUpdate(
    createActivity({ title: "T" }, "a1", NOW),
    { status: "done" },
    NOW,
  );
  expect(next.pending_interaction).toBeUndefined();
});

// A payload this build cannot read says NOTHING about what should be stored, so
// it is treated as absent — never as "keep what's there". Otherwise a done patch
// that also carried junk would skip the strip and leave a Done card asking a
// question.
const MALFORMED = {
  kind: "question",
  question: "Which deck?",
} as unknown as PendingInteraction; // a pre-step build's shape: no `steps`

test("a done patch with a MALFORMED pending_interaction still strips", () => {
  const next = applyActivityUpdate(
    withInteraction([QUESTION_STEP, ACTIONS_STEP]),
    { status: "done", pending_interaction: MALFORMED },
    NOW,
  );
  expect(next.pending_interaction).toEqual({ steps: [ACTIONS_STEP] });
});

test("a done patch with a malformed payload clears when only blocking steps remain", () => {
  const next = applyActivityUpdate(
    withInteraction([QUESTION_STEP]),
    { status: "done", pending_interaction: MALFORMED },
    NOW,
  );
  expect("pending_interaction" in next).toBe(false);
});

test("a NON-done patch with a malformed payload leaves the stored one alone", () => {
  const steps = [QUESTION_STEP, ACTIONS_STEP];
  const next = applyActivityUpdate(
    withInteraction(steps),
    { status: "needs_you", pending_interaction: MALFORMED },
    NOW,
  );
  expect(next.pending_interaction).toEqual({ steps });
});
