import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { type HydrateListedObject, startHydrate } from "./hydrate";
import { memoryStore } from "./memory-store.test-support";

test("hot-set filters receive listed byte sizes, including zero", async () => {
  const remote = memoryStore({ "empty.jsonl": "", "live.jsonl": "live" });
  const root = await mkdtemp(join(tmpdir(), "hydrate-filter-size-"));
  try {
    let observed: readonly HydrateListedObject[] = [];
    const started = await startHydrate(remote.store, "", root, {
      filter: (rel, listing) => {
        observed = listing;
        return rel === "live.jsonl";
      },
    });
    await started.deferred;
    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "empty.jsonl", size: 0 }),
        expect.objectContaining({ rel: "live.jsonl", size: 4 }),
      ]),
    );
    expect([...started.manifest.keys()]).toEqual(["live.jsonl"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
