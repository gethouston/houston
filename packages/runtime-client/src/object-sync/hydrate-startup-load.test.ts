import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { startHydrate } from "./hydrate";
import {
  type BatchReadOutcome,
  LocalDirStore,
  type ObjectStore,
} from "./object-store";

/**
 * Once `done` resolves, `startupLoad()` reports what the startup download
 * fetched: priority and eager objects only. Filtered objects, deferred
 * objects and objects the store no longer holds stay out, so a slow hydrate
 * can be split into "more to load" versus "a slower store".
 */

function tree(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "hydrate-startup-"));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(root, "p", ...rel.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return new LocalDirStore(root);
}

const dest = () => mkdtempSync(join(tmpdir(), "hydrate-startup-dest-"));

test("done counts the priority and eager objects it fetched, never filtered or deferred ones", async () => {
  const store = tree({
    "data/settings.json": "abc",
    "workspace/a.txt": "12345",
    "workspace/b.txt": "1234567",
    "workspace/skip.txt": "filtered out",
    "workspace/uploads/photo.png": "deferred bytes",
  });
  const started = await startHydrate(store, "p", dest(), {
    priority: (rel) => rel.startsWith("data/"),
    filter: (rel) => !rel.endsWith("skip.txt"),
    defer: (rel) => rel.startsWith("workspace/uploads/"),
  });

  await started.done;
  expect(started.startupLoad()).toEqual({ objects: 3, bytes: 15 });
  expect(started.skippedObjects).toBe(1);
  await started.deferred;
  expect(started.manifest.size).toBe(4);
  expect(started.startupLoad()).toEqual({ objects: 3, bytes: 15 });
});

test("a batched store counts inlined and fallback reads, not a key gone since the listing", async () => {
  const inner = tree({
    "CLAUDE.md": "instructions",
    "notes.md": "notes",
    "gone.md": "deleted after listing",
    "big.bin": "large object",
  });
  const store: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    manifest: (prefix) => inner.manifest(prefix),
    download: (key, file, opts) => inner.download(key, file, opts),
    downloadMany: async (entries) => {
      const outcomes = new Map<string, BatchReadOutcome>();
      for (const { key, destFile } of entries) {
        if (key.endsWith("gone.md")) outcomes.set(key, { status: "missing" });
        else if (key.endsWith("big.bin"))
          outcomes.set(key, { status: "fallback" });
        else {
          await inner.download(key, destFile);
          outcomes.set(key, { status: "ok" });
        }
      }
      return outcomes;
    },
    upload: (source, key, opts) => inner.upload(source, key, opts),
    delete: (key, opts) => inner.delete(key, opts),
  };
  const started = await startHydrate(store, "p", dest());
  await started.done;

  expect(started.startupLoad()).toEqual({
    objects: 3,
    bytes: "instructions".length + "notes".length + "large object".length,
  });
});
