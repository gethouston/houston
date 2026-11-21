import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { Learning } from "../src/data/learnings.ts";
import {
  appendLearning,
  dropLearning,
  editLearning,
  newLearning,
} from "../src/lib/learning-optimistic.ts";

const NOW = "2026-10-08T12:00:00.000Z";
const a: Learning = {
  id: "a",
  text: "Invoices go out Fridays",
  created_at: NOW,
};
const b: Learning = { id: "b", text: "Use metric units", created_at: NOW };

describe("newLearning", () => {
  it("stamps who taught it only when the caller passes someone", () => {
    deepStrictEqual(newLearning("x", undefined, "id1", NOW), {
      id: "id1",
      text: "x",
      created_at: NOW,
    });
    deepStrictEqual(
      newLearning("x", { user_id: "u1", name: "Ana" }, "id1", NOW).taught_by,
      { user_id: "u1", name: "Ana" },
    );
  });
});

describe("appendLearning", () => {
  it("adds the row once, however often it runs", () => {
    const once = appendLearning([a], b);
    deepStrictEqual(once, [a, b]);
    strictEqual(appendLearning(once, b), once);
    strictEqual(appendLearning(undefined, b), undefined);
  });
});

describe("editLearning", () => {
  it("replaces one learning's text and keeps the others identical", () => {
    const next = editLearning([a, b], "a", "Invoices go out Mondays");
    strictEqual(next?.[0]?.text, "Invoices go out Mondays");
    strictEqual(next?.[1], b);
    strictEqual(
      editLearning(next, "a", "Invoices go out Mondays")?.[0],
      next?.[0],
    );
    strictEqual(editLearning(undefined, "a", "x"), undefined);
  });
});

describe("dropLearning", () => {
  it("removes the learning and is a no-op once it is gone", () => {
    const next = dropLearning([a, b], "a");
    deepStrictEqual(next, [b]);
    strictEqual(dropLearning(next, "a"), next);
    strictEqual(dropLearning(undefined, "a"), undefined);
  });
});
