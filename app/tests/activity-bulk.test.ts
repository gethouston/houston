import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import type { Activity } from "../src/data/activity.ts";
import {
  applyActivityPatch,
  applyBulkPatch,
  applyBulkRemove,
  applyRemove,
} from "../src/data/activity-bulk.ts";

const item = (id: string, status: string): Activity => ({
  id,
  title: id,
  description: "",
  status,
});

describe("activity bulk helpers", () => {
  it("patches only matching ids and stamps updated_at", () => {
    const items = [item("a", "done"), item("b", "done"), item("c", "running")];
    const next = applyBulkPatch(
      items,
      new Set(["a", "c"]),
      { status: "archived" },
      "2026-01-01T00:00:00.000Z",
    );
    strictEqual(next[0].status, "archived");
    strictEqual(next[0].updated_at, "2026-01-01T00:00:00.000Z");
    // Unselected row untouched — no status change, no timestamp stamp.
    strictEqual(next[1].status, "done");
    strictEqual(next[1].updated_at, undefined);
    strictEqual(next[2].status, "archived");
    strictEqual(next[2].updated_at, "2026-01-01T00:00:00.000Z");
  });

  it("treats unknown ids as a no-op", () => {
    const items = [item("a", "done")];
    const next = applyBulkPatch(
      items,
      new Set(["zzz"]),
      { status: "archived" },
      "t",
    );
    deepStrictEqual(next, items);
  });

  it("removes only matching ids and preserves order", () => {
    const items = [item("a", "done"), item("b", "done"), item("c", "running")];
    const next = applyBulkRemove(items, new Set(["a", "b"]));
    deepStrictEqual(
      next.map((i) => i.id),
      ["c"],
    );
  });

  it("single remove reports whether a row was removed", () => {
    const items = [item("a", "done"), item("b", "running")];
    const result = applyRemove(items, "a");
    deepStrictEqual(result, {
      items: [items[1]],
      removed: true,
    });
  });

  it("removing an unknown id leaves the list unchanged", () => {
    const items = [item("a", "done")];
    deepStrictEqual(applyBulkRemove(items, new Set(["zzz"])), items);
  });

  it("single remove treats unknown ids as an idempotent no-op", () => {
    // Same-length list back with `removed: false` signals "already gone" so
    // `remove()` skips the write and resolves instead of throwing — preserving
    // the HOU-462 unhandled-rejection fix under the richer return shape.
    const items = [item("a", "done")];
    deepStrictEqual(applyRemove(items, "zzz"), { items, removed: false });
  });
});

// ── Moving a mission to Done ────────────────────────────────────────────────
// The user's own move answers whatever the mission was waiting on: the blocking
// steps go, the optional clean-finish offers keep rendering on the Done card.

const QUESTION_STEP: InteractionStep = {
  kind: "question",
  id: "q1",
  question: "Which deck?",
};
const ACTIONS_STEP: InteractionStep = {
  kind: "suggest_actions",
  id: "a1",
  actions: [
    { id: "x", label: "Send it", message: "Send the deck" },
    { id: "y", label: "Draft a note", message: "Draft the note" },
  ],
};
const REUSABLE_STEP: InteractionStep = {
  kind: "suggest_reusable",
  id: "r1",
  reusableKind: "skill",
  title: "Weekly deck",
  rationale: "You do this every week.",
};

const waiting = (id: string, steps: InteractionStep[]): Activity => ({
  ...item(id, "needs_you"),
  pending_interaction: { steps },
});

describe("activity patch: pending_interaction on a move to done", () => {
  it("keeps the suggestion offers and drops the blocking steps", () => {
    const next = applyActivityPatch(
      waiting("a", [QUESTION_STEP, ACTIONS_STEP, REUSABLE_STEP]),
      { status: "done" },
      "t",
    );
    strictEqual(next.status, "done");
    deepStrictEqual(next.pending_interaction, {
      steps: [ACTIONS_STEP, REUSABLE_STEP],
    });
  });

  it("clears the key when only blocking steps remain", () => {
    const next = applyActivityPatch(
      waiting("a", [
        QUESTION_STEP,
        { kind: "connect", id: "c1", toolkit: "gmail" },
      ]),
      { status: "done" },
      "t",
    );
    strictEqual("pending_interaction" in next, false);
  });

  it("leaves the interaction alone on a non-done patch", () => {
    for (const patch of [{ status: "archived" }, { title: "Renamed" }]) {
      const next = applyActivityPatch(
        waiting("a", [QUESTION_STEP, ACTIONS_STEP]),
        patch,
        "t",
      );
      deepStrictEqual(next.pending_interaction, {
        steps: [QUESTION_STEP, ACTIONS_STEP],
      });
    }
  });

  it("lets an explicit pending_interaction in the patch win", () => {
    const next = applyActivityPatch(
      waiting("a", [QUESTION_STEP, ACTIONS_STEP]),
      { status: "done", pending_interaction: { steps: [REUSABLE_STEP] } },
      "t",
    );
    deepStrictEqual(next.pending_interaction, { steps: [REUSABLE_STEP] });
  });

  it("clears outright on an explicit null", () => {
    const next = applyActivityPatch(
      waiting("a", [ACTIONS_STEP]),
      { pending_interaction: null },
      "t",
    );
    strictEqual("pending_interaction" in next, false);
  });

  it("strips through the bulk path too (multi-select move to done)", () => {
    const items = [
      waiting("a", [QUESTION_STEP, ACTIONS_STEP]),
      waiting("b", [QUESTION_STEP]),
      waiting("c", [ACTIONS_STEP]),
    ];
    const next = applyBulkPatch(
      items,
      new Set(["a", "b"]),
      { status: "done" },
      "t",
    );
    deepStrictEqual(next[0].pending_interaction, { steps: [ACTIONS_STEP] });
    strictEqual("pending_interaction" in next[1], false);
    // Untouched row keeps everything, timestamp included.
    deepStrictEqual(next[2], items[2]);
  });
});

/**
 * The local write path mirrors the host's `applyActivityUpdate` field for
 * field. Two rules it used to break: it wrote an untrusted interaction with no
 * validation at all, and it spread `undefined` values over stored fields.
 */
describe("activity patch: parity with the host merge rule", () => {
  // A pre-step build's shape (no `steps`) — what a stale message can carry.
  const MALFORMED = {
    kind: "question",
    question: "Which deck?",
  } as unknown as { steps: InteractionStep[] };

  it("treats a malformed interaction as ABSENT, so a done patch still strips", () => {
    const next = applyActivityPatch(
      waiting("a", [QUESTION_STEP, ACTIONS_STEP]),
      { status: "done", pending_interaction: MALFORMED },
      "t",
    );
    deepStrictEqual(next.pending_interaction, { steps: [ACTIONS_STEP] });
  });

  it("never persists a malformed interaction over a valid stored one", () => {
    const next = applyActivityPatch(
      waiting("a", [QUESTION_STEP, ACTIONS_STEP]),
      { status: "needs_you", pending_interaction: MALFORMED },
      "t",
    );
    deepStrictEqual(next.pending_interaction, {
      steps: [QUESTION_STEP, ACTIONS_STEP],
    });
  });

  it("ignores undefined VALUES instead of blanking the stored field", () => {
    // A caller spreading an optional into a patch must not wipe `status` — the
    // schema requires it, and the host path has always ignored undefined.
    const next = applyActivityPatch(item("a", "needs_you"), {}, "t");
    strictEqual(next.status, "needs_you");
    strictEqual(
      applyActivityPatch(item("a", "needs_you"), { status: undefined }, "t")
        .status,
      "needs_you",
    );
    strictEqual(
      applyActivityPatch(item("a", "needs_you"), { title: undefined }, "t")
        .title,
      item("a", "needs_you").title,
    );
  });

  it("still writes an explicit null (clearing is not the same as absent)", () => {
    const next = applyActivityPatch(
      { ...item("a", "running"), claude_session_id: "sess" },
      { claude_session_id: null },
      "t",
    );
    strictEqual(next.claude_session_id, null);
  });
});
