import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { applyBulkPatch, applyBulkRemove, applyRemove } from "../src/data/activity-bulk.ts";
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
    const items = [item("a", "done")];
    deepStrictEqual(applyRemove(items, "zzz"), { items, removed: false });
  });
});
