import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { memoryStore } from "./memory-store.test-support";
import { syncBack } from "./sync-back";

async function deleteAfterRemoteChange(workerMerge: boolean) {
  const remote = memoryStore({ "notes.md": "v1", "other.md": "x" });
  const owned = remote.generation("notes.md");
  remote.put("notes.md", "v2");
  const dir = await mkdtemp(join(tmpdir(), "sync-back-refresh-"));
  const result = await syncBack(
    remote.store,
    "",
    dir,
    new Map([["notes.md", { hash: "h", generation: owned }]]),
    { generations: true, ...(workerMerge ? { workerMerge } : {}) },
  );
  return { remote, result };
}

test("a worker's delete conflict refreshes the one key, not the whole store", async () => {
  const { remote, result } = await deleteAfterRemoteChange(true);
  expect(remote.calls).toEqual(["get notes.md"]);
  expect(result.deleted).toEqual(["notes.md"]);
});

test("the standing sync keeps its one listing per pass", async () => {
  const { remote, result } = await deleteAfterRemoteChange(false);
  expect(remote.calls).toEqual(["manifest "]);
  expect(result.deleted).toEqual(["notes.md"]);
});
