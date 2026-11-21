import { deepStrictEqual, rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import type { Activity } from "../src/data/activity.ts";
import { activityWrites } from "../src/data/activity-writes.ts";

const card = (id: string): Activity => ({
  id,
  title: id,
  description: "",
  status: "needs_you",
});

function fakeFile(initial: Activity[]) {
  const files = new Map<string, Activity[]>([["/a", initial]]);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  let n = 0;
  const writes = activityWrites({
    list: async (path) => {
      const items = files.get(path) ?? [];
      await tick();
      return items;
    },
    write: async (path, items) => {
      await tick();
      files.set(path, items);
    },
    now: () => "2026-10-08T00:00:00Z",
    newId: () => `new${++n}`,
  });
  const ids = (path = "/a") => (files.get(path) ?? []).map((a) => a.id);
  return { writes, ids };
}

describe("activityWrites", () => {
  it("a second delete on one agent reads what the first wrote", async () => {
    const { writes, ids } = fakeFile([card("a"), card("b"), card("c")]);
    await Promise.all([writes.remove("/a", "a"), writes.remove("/a", "b")]);
    deepStrictEqual(ids(), ["c"]);
  });

  it("orders every kind of write, create included", async () => {
    const { writes, ids } = fakeFile([card("a"), card("b"), card("c")]);
    await Promise.all([
      writes.bulkRemove("/a", ["a"]),
      writes.create("/a", "fresh", ""),
      writes.update("/a", "b", { status: "done" }),
      writes.bulkUpdate("/a", ["c"], { status: "archived" }),
      writes.remove("/a", "b"),
    ]);
    deepStrictEqual(ids(), ["c", "new1"]);
  });

  it("a refused write rejects its own caller and the next still runs", async () => {
    const { writes, ids } = fakeFile([card("a"), card("b")]);
    const missing = writes.update("/a", "zzz", { status: "done" });
    const next = writes.remove("/a", "a");
    await rejects(missing, /Activity not found/);
    await next;
    deepStrictEqual(ids(), ["b"]);
  });
});
