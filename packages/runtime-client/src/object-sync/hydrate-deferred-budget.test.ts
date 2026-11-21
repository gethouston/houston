import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { startHydrate } from "./hydrate";
import {
  type BatchReadOutcome,
  LocalDirStore,
  type ObjectStore,
} from "./object-store";

const PREFIX = "p";

function store(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "hydrate-budget-"));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(root, PREFIX, ...rel.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return new LocalDirStore(root);
}

function unsized(inner: LocalDirStore): ObjectStore {
  return {
    list: (p) => inner.list(p),
    download: (k, d, o) => inner.download(k, d, o),
    upload: (s, k, o) => inner.upload(s, k, o),
    delete: (k, o) => inner.delete(k, o),
  };
}

function batched(inner: LocalDirStore): ObjectStore {
  return {
    ...unsized(inner),
    async downloadMany(entries, opts) {
      const outcomes = new Map<string, BatchReadOutcome>();
      for (const { key, destFile } of entries) {
        await inner.download(key, destFile, opts);
        outcomes.set(key, { status: "ok" });
      }
      return outcomes;
    },
  };
}

const later = (rel: string) => rel.startsWith("files/");

test("deferred bytes past the critical cap still land under their own budget", async () => {
  const files = store({
    "state.json": "0123456789",
    "files/a.bin": "a".repeat(40),
    "files/b.bin": "b".repeat(40),
  });
  const started = await startHydrate(
    files,
    PREFIX,
    mkdtempSync(join(tmpdir(), "d-")),
    { maxBytes: 12, deferredMaxBytes: 100, defer: later },
  );
  await started.done;
  await started.deferred;
  expect([...started.manifest.keys()].sort()).toEqual([
    "files/a.bin",
    "files/b.bin",
    "state.json",
  ]);
});

test("a deferred set listed over its budget refuses only the deferred files", async () => {
  const files = store({
    "state.json": "0123456789",
    "files/a.bin": "a".repeat(60),
    "files/b.bin": "b".repeat(60),
  });
  const work = mkdtempSync(join(tmpdir(), "d-"));
  const started = await startHydrate(files, PREFIX, work, {
    maxBytes: 12,
    deferredMaxBytes: 100,
    defer: later,
  });
  await started.done;
  await expect(started.deferred).rejects.toMatchObject({
    name: "HydrateLimitError",
    maxBytes: 100,
    observedBytes: 120,
  });
  expect(started.manifest.has("state.json")).toBe(true);
  expect(existsSync(join(work, "files", "a.bin"))).toBe(false);
  expect(existsSync(join(work, "files", "b.bin"))).toBe(false);
});

test("unsized deferred downloads count against the deferred budget, not the critical one", async () => {
  const inner = store({
    "state.json": "0123456789",
    "files/a.bin": "a".repeat(40),
  });
  const started = await startHydrate(
    unsized(inner),
    PREFIX,
    mkdtempSync(join(tmpdir(), "d-")),
    { maxBytes: 12, deferredMaxBytes: 100, defer: later },
  );
  await started.deferred;
  expect(started.manifest.has("files/a.bin")).toBe(true);
});

test("unsized deferred downloads past the deferred budget fail the deferred set", async () => {
  const inner = store({
    "state.json": "0123456789",
    "files/a.bin": "a".repeat(80),
    "files/b.bin": "b".repeat(80),
  });
  const started = await startHydrate(
    unsized(inner),
    PREFIX,
    mkdtempSync(join(tmpdir(), "d-")),
    { maxBytes: 12, deferredMaxBytes: 100, defer: later },
  );
  await started.done;
  await expect(started.deferred).rejects.toMatchObject({
    name: "HydrateLimitError",
    maxBytes: 100,
  });
});

test("without a deferred budget the deferred set gets its own budget of the critical size", async () => {
  const files = store({
    "state.json": "0123456789",
    "files/a.bin": "a".repeat(40),
  });
  const started = await startHydrate(
    files,
    PREFIX,
    mkdtempSync(join(tmpdir(), "d-")),
    { maxBytes: 12, defer: later },
  );
  await started.done;
  await expect(started.deferred).rejects.toMatchObject({
    name: "HydrateLimitError",
    maxBytes: 12,
  });
});

test("batched deferred reads count against the deferred budget, not the critical one", async () => {
  const fits = await startHydrate(
    batched(
      store({
        "state.json": "0123456789",
        "files/a.bin": "a".repeat(40),
        "files/b.bin": "b".repeat(40),
      }),
    ),
    PREFIX,
    mkdtempSync(join(tmpdir(), "d-")),
    { maxBytes: 12, deferredMaxBytes: 100, defer: later },
  );
  await fits.deferred;
  expect(fits.manifest.has("files/b.bin")).toBe(true);

  const over = await startHydrate(
    batched(
      store({
        "state.json": "0123456789",
        "files/a.bin": "a".repeat(80),
        "files/b.bin": "b".repeat(80),
      }),
    ),
    PREFIX,
    mkdtempSync(join(tmpdir(), "d-")),
    { maxBytes: 12, deferredMaxBytes: 100, defer: later },
  );
  await over.done;
  await expect(over.deferred).rejects.toMatchObject({
    name: "HydrateLimitError",
    maxBytes: 100,
  });
});
