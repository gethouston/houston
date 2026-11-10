import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { HydrateLimitError, startHydrate } from "./hydrate";
import { LocalDirStore } from "./local-dir-store";
import { memoryStore } from "./memory-store.test-support";
import { StoreReadTimeoutError } from "./read-timeout";
import { syncBack } from "./sync-back";

const write = async (root: string, rel: string, body: string) => {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), body);
};

test("a caller's listing is the ownership boundary: unlisted objects are neither landed nor deleted", async () => {
  const remote = memoryStore({
    "a/listed.txt": "listed",
    "b/unlisted.txt": "never listed",
  });
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const listed = await remote.store.manifest?.("a");
  const started = await startHydrate(remote.store, "", dest, {
    listing: { objects: listed ?? [] },
  });
  await started.deferred;
  expect([...started.manifest.keys()]).toEqual(["a/listed.txt"]);
  expect(existsSync(join(dest, "b/unlisted.txt"))).toBe(false);
  expect(remote.calls).not.toContain("manifest ");

  const result = await syncBack(remote.store, "", dest, started.manifest, {
    generations: true,
    workerMerge: true,
  });
  expect(result.deleted).toEqual([]);
  expect(remote.body("b/unlisted.txt")).toBe("never listed");
});

test("a write at a path the listing never named goes out create-only, and its conflict refreshes that one key", async () => {
  const remote = memoryStore({ "b/unlisted.txt": "theirs" });
  const theirs = remote.generation("b/unlisted.txt");
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const started = await startHydrate(remote.store, "", dest, {
    listing: { objects: [] },
  });
  await started.deferred;
  await write(dest, "b/unlisted.txt", "ours");
  const result = await syncBack(remote.store, "", dest, started.manifest, {
    generations: true,
    workerMerge: true,
    include: () => true,
  });
  // Create-only first. The retry at the generation the one-key read saw is
  // the standing conflict rule for a plain file (last writer wins); a claimed
  // turn never writes outside what it listed (runtime turn-store-scope.ts).
  expect(remote.writes).toEqual([
    { op: "put", key: "b/unlisted.txt", ifGenerationMatch: "0" },
    { op: "put", key: "b/unlisted.txt", ifGenerationMatch: theirs },
  ]);
  expect(remote.calls).toContain("get b/unlisted.txt");
  expect(remote.calls.filter((call) => call.startsWith("manifest"))).toEqual(
    [],
  );
  expect(result.conflicts).toEqual([]);
});

test("a point read lands at the generation of the read; an absent one stays unowned", async () => {
  const remote = memoryStore({ "conv/c1.json": "{}" });
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const started = await startHydrate(remote.store, "", dest, {
    listing: { objects: [], reads: ["conv/c1.json", "conv/c2.json"] },
  });
  await started.deferred;
  expect(started.manifest.get("conv/c1.json")?.generation).toBe(
    remote.generation("conv/c1.json"),
  );
  expect(started.manifest.has("conv/c2.json")).toBe(false);
  expect(started.listed.rels).toEqual([]);

  await write(dest, "conv/c2.json", "new");
  await syncBack(remote.store, "", dest, started.manifest, {
    generations: true,
    workerMerge: true,
  });
  expect(remote.writes).toEqual([
    { op: "put", key: "conv/c2.json", ifGenerationMatch: "0" },
  ]);
});

test("a later listing lands only in `deferred`, never in `done`", async () => {
  const remote = memoryStore({
    "agent/CLAUDE.md": "hi",
    "agent/docs/a.md": "a",
  });
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const later = gate.then(() => remote.store.manifest?.("agent/docs") ?? []);
  const critical = (await remote.store.manifest?.("agent")) ?? [];
  const started = await startHydrate(remote.store, "", dest, {
    listing: {
      objects: critical.filter(({ key }) => key === "agent/CLAUDE.md"),
      later: () => later,
    },
  });
  await started.done;
  expect(existsSync(join(dest, "agent/docs/a.md"))).toBe(false);
  release();
  await started.deferred;
  expect(await readFile(join(dest, "agent/docs/a.md"), "utf8")).toBe("a");
  expect(started.manifest.has("agent/docs/a.md")).toBe(true);
});

test("a failed later listing fails `deferred` and leaves `done` alone", async () => {
  const remote = memoryStore({ "agent/CLAUDE.md": "hi" });
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const started = await startHydrate(remote.store, "", dest, {
    listing: {
      objects: (await remote.store.manifest?.("agent")) ?? [],
      later: async () => {
        throw new Error("listing failed");
      },
    },
  });
  await expect(started.done).resolves.toBeUndefined();
  await expect(started.deferred).rejects.toThrow("listing failed");
});

test("a later listing over the deferred budget refuses before downloading", async () => {
  const remote = memoryStore({ "agent/docs/big.bin": "x".repeat(64) });
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const started = await startHydrate(remote.store, "", dest, {
    deferredMaxBytes: 16,
    listing: {
      objects: [],
      later: async () => (await remote.store.manifest?.("agent")) ?? [],
    },
  });
  await expect(started.deferred).rejects.toBeInstanceOf(HydrateLimitError);
  expect(remote.calls.some((call) => call.startsWith("get"))).toBe(false);
});

test("abandoning while the later listing is pending rejects `deferred` at once and stops the listing", async () => {
  const remote = memoryStore({ "agent/CLAUDE.md": "hi" });
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  let listingSignal: AbortSignal | undefined;
  const started = await startHydrate(remote.store, "", dest, {
    listing: {
      objects: (await remote.store.manifest?.("agent")) ?? [],
      // A listing that never answers on its own.
      later: (signal) => {
        listingSignal = signal;
        return new Promise(() => undefined);
      },
    },
  });
  await started.done;
  const reason = new Error("abandoned");
  started.abort(reason);
  await expect(started.deferred).rejects.toBe(reason);
  expect(listingSignal?.aborted).toBe(true);
});

test("a later listing that outlives the deferred read deadline fails `deferred`", async () => {
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const started = await startHydrate(memoryStore().store, "", dest, {
    deferredReadTimeoutMs: 20,
    listing: { objects: [], later: () => new Promise(() => undefined) },
  });
  await expect(started.deferred).rejects.toBeInstanceOf(StoreReadTimeoutError);
});

test("a point read that returns no generation lands but stays unowned, so its write goes out create-only", async () => {
  const remote = memoryStore({ "conv/c1.json": "{}", "other.txt": "x" });
  const read = remote.store.download;
  const store = {
    ...remote.store,
    download: async (key: string, dest: string) => {
      await read(key, dest);
      return {};
    },
    downloadVersioned: async (key: string, dest: string) => {
      await read(key, dest);
      return {};
    },
  };
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const listed = (await remote.store.manifest?.("")) ?? [];
  const started = await startHydrate(store, "", dest, {
    // The listing shows a store with generations.
    listing: {
      objects: listed.filter(({ key }) => key !== "conv/c1.json"),
      reads: ["conv/c1.json"],
    },
  });
  await started.deferred;
  expect(await readFile(join(dest, "conv/c1.json"), "utf8")).toBe("{}");
  expect(started.manifest.has("conv/c1.json")).toBe(false);
  await write(dest, "conv/c1.json", '{"messages":[1]}');
  await syncBack(store, "", dest, started.manifest, {
    generations: true,
    workerMerge: true,
  });
  expect(remote.writes[0]).toEqual({
    op: "put",
    key: "conv/c1.json",
    ifGenerationMatch: "0",
  });
});

test("in a store without generations a point read stays owned, so an unchanged file is not uploaded", async () => {
  const root = await mkdtemp(join(tmpdir(), "hydrate-listing-store-"));
  await write(root, "conv/c1.json", "{}");
  const store = new LocalDirStore(root);
  const dest = await mkdtemp(join(tmpdir(), "hydrate-listing-"));
  const started = await startHydrate(store, "", dest, {
    listing: { objects: [], reads: ["conv/c1.json"] },
  });
  await started.deferred;
  expect(started.manifest.has("conv/c1.json")).toBe(true);
  const result = await syncBack(store, "", dest, started.manifest, {});
  expect(result.uploaded).toEqual([]);
});
