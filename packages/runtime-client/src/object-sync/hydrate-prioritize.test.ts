import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { startHydrate } from "./hydrate";
import { HydrateLimitError } from "./hydrate-limit";
import {
  type BatchReadOutcome,
  LocalDirStore,
  type ObjectStore,
} from "./object-store";

function tree(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), "hydrate-prioritize-"));
  for (const rel of files) {
    const path = join(root, "p", ...rel.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, rel);
  }
  return new LocalDirStore(root);
}

function held(inner: LocalDirStore, holds: (key: string) => boolean) {
  const order: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    async download(key, destination, options) {
      if (holds(key)) await gate;
      order.push(key);
      return inner.download(key, destination, options);
    },
    upload: (s, k, o) => inner.upload(s, k, o),
    delete: (k, o) => inner.delete(k, o),
  };
  return { store, order, release };
}

const files = (rel: string) => rel.startsWith("files/");

function settledLog() {
  const settled: string[] = [];
  const waiters = new Map<string, () => void>();
  return {
    settled,
    onSettled(rel: string) {
      settled.push(rel);
      waiters.get(rel)?.();
    },
    landed(rel: string) {
      if (settled.includes(rel)) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.set(rel, resolve));
    },
  };
}
const dest = () => mkdtempSync(join(tmpdir(), "hydrate-prioritize-dest-"));

test("the deferred set is told before it downloads, and each object as it settles", async () => {
  const inner = tree(["CLAUDE.md", "files/a.md", "files/b.md"]);
  const events: string[] = [];
  const started = await startHydrate(inner, "p", dest(), {
    defer: files,
    onDeferredListed: (rels) => events.push(`listed ${[...rels].sort()}`),
    onDeferredSettled: (rel) => events.push(`settled ${rel}`),
  });
  await started.deferred;
  expect(events[0]).toBe("listed files/a.md,files/b.md");
  expect(events.slice(1).sort()).toEqual([
    "settled files/a.md",
    "settled files/b.md",
  ]);
});

test("a prioritized object lands while the rest of the deferred set still waits", async () => {
  const inner = tree(["files/a.md", "files/b.md", "files/c.md"]);
  const { store, order, release } = held(inner, (key) => !key.endsWith("c.md"));
  const root = dest();
  const log = settledLog();
  let listed: (rels: readonly string[]) => void = () => undefined;
  const known = new Promise<readonly string[]>((resolve) => {
    listed = resolve;
  });
  const started = await startHydrate(store, "p", root, {
    defer: files,
    deferredParallel: 1,
    onDeferredListed: listed,
    onDeferredSettled: log.onSettled,
  });
  expect(await known).toContain("files/c.md");
  started.prioritize(["files/c.md"]);
  await log.landed("files/c.md");
  expect(log.settled).toEqual(["files/c.md"]);
  expect(existsSync(join(root, "files", "c.md"))).toBe(true);
  release();
  await started.deferred;
  expect(order.filter((key) => key.endsWith("c.md"))).toHaveLength(1);
  expect(started.manifest.has("files/a.md")).toBe(true);
  expect(started.manifest.has("files/c.md")).toBe(true);
});

function batching(store: ObjectStore, large: (key: string) => boolean) {
  const batched: ObjectStore = {
    ...store,
    async downloadMany(entries, opts) {
      const outcomes = new Map<string, BatchReadOutcome>();
      for (const { key, destFile } of entries) {
        if (large(key)) {
          outcomes.set(key, { status: "fallback" });
          continue;
        }
        await store.download(key, destFile, opts);
        outcomes.set(key, { status: "ok" });
      }
      return outcomes;
    },
  };
  return batched;
}

test("a large object the batch route leaves for later can still be prioritized", async () => {
  const inner = tree(["files/a.md", "files/big1.bin", "files/big2.bin"]);
  const { store, release } = held(inner, (key) => key.endsWith("big1.bin"));
  const log = settledLog();
  const started = await startHydrate(
    batching(store, (key) => key.endsWith(".bin")),
    "p",
    dest(),
    {
      defer: files,
      deferredParallel: 1,
      onDeferredSettled: log.onSettled,
    },
  );
  await log.landed("files/a.md");
  await new Promise((resolve) => setTimeout(resolve, 5));
  started.prioritize(["files/big2.bin"]);
  await log.landed("files/big2.bin");
  expect(log.settled).toEqual(["files/a.md", "files/big2.bin"]);
  release();
  await started.deferred;
  expect(started.manifest.has("files/big1.bin")).toBe(true);
});

test("an object asked for while its batch is in flight is fetched once the batch leaves it", async () => {
  const inner = tree(["files/a.md", "files/big.bin"]);
  const { store, order, release } = held(inner, (key) => key.endsWith("a.md"));
  let listed: () => void = () => undefined;
  const known = new Promise<void>((resolve) => {
    listed = resolve;
  });
  const started = await startHydrate(
    batching(store, (key) => key.endsWith(".bin")),
    "p",
    dest(),
    { defer: files, onDeferredListed: () => listed() },
  );
  await known;
  await new Promise((resolve) => setTimeout(resolve, 5));
  started.prioritize(["files/big.bin"]);
  release();
  await started.deferred;
  expect(order.filter((key) => key.endsWith("big.bin"))).toHaveLength(1);
  expect(started.manifest.has("files/big.bin")).toBe(true);
});

test("a deferred set over its budget is still told, then refused", async () => {
  const inner = tree(["files/a.md", "files/b.md"]);
  let told: readonly string[] = [];
  const started = await startHydrate(inner, "p", dest(), {
    defer: files,
    deferredMaxBytes: 4,
    onDeferredListed: (rels) => {
      told = rels;
    },
  });
  await expect(started.deferred).rejects.toBeInstanceOf(HydrateLimitError);
  expect([...told].sort()).toEqual(["files/a.md", "files/b.md"]);
});

test("a prioritized download that fails fails the deferred set", async () => {
  const inner = tree(["files/a.md", "files/b.md"]);
  const { store, release } = held(inner, (key) => key.endsWith("a.md"));
  const failing: ObjectStore = {
    ...store,
    async download(key, destination, options) {
      if (key.endsWith("b.md")) throw new Error("store unreachable");
      return store.download(key, destination, options);
    },
  };
  let listed: () => void = () => undefined;
  const known = new Promise<void>((resolve) => {
    listed = resolve;
  });
  const started = await startHydrate(failing, "p", dest(), {
    defer: files,
    deferredParallel: 1,
    onDeferredListed: () => listed(),
  });
  const outcome = started.deferred.then(
    () => "landed",
    (error: unknown) => (error instanceof Error ? error.message : "failed"),
  );
  await known;
  started.prioritize(["files/b.md"]);
  release();
  expect(await outcome).toBe("store unreachable");
});
