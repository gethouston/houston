import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  applyBulkPatch,
  applyBulkRemove,
  applyRemove,
} from "../src/data/activity-bulk.ts";
import type { Activity } from "../src/data/activity.ts";

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
    const next = applyBulkPatch(items, new Set(["zzz"]), { status: "archived" }, "t");
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

  it("removing an unknown id leaves the list unchanged", () => {
    const items = [item("a", "done")];
    deepStrictEqual(applyBulkRemove(items, new Set(["zzz"])), items);
  });

  it("removes a single matching id and preserves order", () => {
    const items = [item("a", "done"), item("b", "done"), item("c", "running")];
    const next = applyRemove(items, "b");
    deepStrictEqual(
      next.map((i) => i.id),
      ["a", "c"],
    );
  });

  it("removing a single unknown id is an idempotent no-op", () => {
    // Same length back signals "already gone" so `remove()` skips the write
    // and resolves instead of throwing — the HOU-462 unhandled-rejection fix.
    const items = [item("a", "done")];
    const next = applyRemove(items, "zzz");
    strictEqual(next.length, items.length);
    deepStrictEqual(
      next.map((i) => i.id),
      ["a"],
    );
  });
});
