import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { startHydrate } from "./hydrate";
import { LocalDirStore, type ObjectStore } from "./object-store";
import { StoreReadTimeoutError } from "./read-timeout";

function tree(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), "hydrate-deferred-"));
  for (const rel of files) {
    const path = join(root, "p", ...rel.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, rel);
  }
  return new LocalDirStore(root);
}

function wrap(
  inner: LocalDirStore,
  download: ObjectStore["download"],
): ObjectStore {
  return {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download,
    upload: (s, k, o) => inner.upload(s, k, o),
    delete: (k, o) => inner.delete(k, o),
  };
}

test("a stalled deferred read times out; the critical set never waits on it", async () => {
  const inner = tree(["a.md", "later/b.md"]);
  const store = wrap(inner, async (key, dest, opts) => {
    if (key.endsWith("b.md"))
      await new Promise((_resolve, reject) =>
        opts?.signal?.addEventListener("abort", () =>
          reject(opts.signal?.reason),
        ),
      );
    await inner.download(key, dest, opts);
  });
  const started = await startHydrate(
    store,
    "p",
    mkdtempSync(join(tmpdir(), "d-")),
    {
      defer: (rel) => rel.startsWith("later/"),
      deferredReadTimeoutMs: 30,
    },
  );
  await started.done;
  await expect(started.deferred).rejects.toBeInstanceOf(StoreReadTimeoutError);
});

test("a large deferred read gets time for its size before it times out", async () => {
  const root = mkdtempSync(join(tmpdir(), "hydrate-deferred-"));
  mkdirSync(join(root, "p", "later"), { recursive: true });
  writeFileSync(join(root, "p", "a.md"), "a");
  writeFileSync(join(root, "p", "later", "pack.bin"), Buffer.alloc(1_000_000));
  const inner = new LocalDirStore(root);
  const store = wrap(inner, async (key, dest, opts) => {
    if (key.endsWith("pack.bin"))
      await new Promise((resolve) => setTimeout(resolve, 80));
    await inner.download(key, dest, opts);
  });
  const started = await startHydrate(
    store,
    "p",
    mkdtempSync(join(tmpdir(), "d-")),
    {
      defer: (rel) => rel.startsWith("later/"),
      deferredReadTimeoutMs: 30,
    },
  );
  await started.deferred;
  expect(started.manifest.has("later/pack.bin")).toBe(true);
});

test("deferred reads stay under their own parallelism cap", async () => {
  const files = Array.from({ length: 12 }, (_, i) => `later/f${i}.md`);
  const inner = tree(["a.md", ...files]);
  let inFlight = 0;
  let peak = 0;
  const store = wrap(inner, async (key, dest, opts) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await inner.download(key, dest, opts);
    inFlight--;
  });
  const started = await startHydrate(
    store,
    "p",
    mkdtempSync(join(tmpdir(), "d-")),
    {
      defer: (rel) => rel.startsWith("later/"),
      deferredParallel: 2,
    },
  );
  await started.deferred;
  expect(peak).toBe(2);
  expect(started.manifest.size).toBe(13);
});

test("abort's reason is what the unlanded deferred set rejects with", async () => {
  const inner = tree(["a.md", "later/b.md"]);
  const store = wrap(inner, async (key, dest, opts) => {
    if (key.endsWith("b.md"))
      await new Promise((_resolve, reject) =>
        opts?.signal?.addEventListener("abort", () =>
          reject(opts.signal?.reason),
        ),
      );
    await inner.download(key, dest, opts);
  });
  const started = await startHydrate(
    store,
    "p",
    mkdtempSync(join(tmpdir(), "d-")),
    {
      defer: (rel) => rel.startsWith("later/"),
    },
  );
  await started.done;
  const reason = new Error("not needed any more");
  started.abort(reason);
  await expect(started.deferred).rejects.toBe(reason);
});
