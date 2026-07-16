import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { excluded, hydrate, syncBack } from "./hydrate";
import { LocalDirStore } from "./object-store";

/**
 * The hydrate-to-sync loop pins faithful materialization, content diffing,
 * manifest ownership, secret exclusions, symlink safety, and hydration limits.
 */

function setup() {
  const storeRoot = mkdtempSync(join(tmpdir(), "houston-store-"));
  const store = new LocalDirStore(storeRoot);
  const work = mkdtempSync(join(tmpdir(), "houston-hyd-"));
  return { storeRoot, store, work };
}

function seed(
  storeRoot: string,
  prefix: string,
  files: Record<string, string>,
) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(storeRoot, ...prefix.split("/"), ...rel.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
}

const PREFIX = "ws/w1/agent-1";

test("hydrate materializes the prefix and syncBack returns the new manifest", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "workspace/notes.txt": "v1",
    "workspace/sub/deep.txt": "deep",
    "data/conversations/c1.json": "{}",
  });

  const manifest = await hydrate(store, PREFIX, work);
  expect(readFileSync(join(work, "workspace", "notes.txt"), "utf8")).toBe("v1");
  expect(readFileSync(join(work, "workspace", "sub", "deep.txt"), "utf8")).toBe(
    "deep",
  );
  expect(manifest.size).toBe(3);

  writeFileSync(join(work, "workspace", "notes.txt"), "v2");
  writeFileSync(join(work, "workspace", "deck.pptx"), "DECK");
  rmSync(join(work, "workspace", "sub", "deep.txt"));

  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded.sort()).toEqual([
    "workspace/deck.pptx",
    "workspace/notes.txt",
  ]);
  expect(result.deleted).toEqual(["workspace/sub/deep.txt"]);
  expect([...result.manifest.keys()].sort()).toEqual([
    "data/conversations/c1.json",
    "workspace/deck.pptx",
    "workspace/notes.txt",
  ]);
  expect(result.totalBytes).toBe(8);
});

test("empty prefix hydrates agent-relative keys", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, "", { "workspace/notes.txt": "hello" });
  const manifest = await hydrate(store, "", work);
  expect(readFileSync(join(work, "workspace", "notes.txt"), "utf8")).toBe(
    "hello",
  );
  expect([...manifest.keys()]).toEqual(["workspace/notes.txt"]);
});

test("auth.json never hydrates in and never syncs out", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "data/auth.json": JSON.stringify({ leaked: "stale-token" }),
    "workspace/file.txt": "x",
  });
  const manifest = await hydrate(store, PREFIX, work);
  expect(manifest.has("data/auth.json")).toBe(false);
  mkdirSync(join(work, "data"), { recursive: true });
  writeFileSync(join(work, "data", "auth.json"), '{"access":"AT-turn"}');
  expect((await syncBack(store, PREFIX, work, manifest)).uploaded).toEqual([]);
  expect(
    (await store.list(PREFIX)).some((key) => key.endsWith("data/auth.json")),
  ).toBe(true);
});

test("exclusions support basenames, subtrees, temp files, and runtime auth", () => {
  const excludes = [
    "credentials.json",
    "claude-login/.credentials.json",
    "db/",
  ];
  expect(excluded("credentials.json", excludes)).toBe(true);
  expect(excluded("nested/credentials.json", excludes)).toBe(true);
  expect(excluded("db/houston.db", excludes)).toBe(true);
  expect(excluded("workspace/write.tmp", excludes)).toBe(true);
  expect(excluded("workspaces/W/A/.houston/runtime/auth.json", excludes)).toBe(
    true,
  );
  expect(excluded("claude-login/projects/cache.json", excludes)).toBe(false);
});

test("an unchanged workspace uploads nothing and remains in the manifest", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a", "workspace/b.txt": "b" });
  const manifest = await hydrate(store, PREFIX, work);
  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded).toEqual([]);
  expect(result.deleted).toEqual([]);
  expect(result.manifest).toEqual(manifest);
});

test("symlinks created locally are never persisted", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  const manifest = await hydrate(store, PREFIX, work);
  symlinkSync("/etc/passwd", join(work, "workspace", "link"));
  expect((await syncBack(store, PREFIX, work, manifest)).uploaded).toEqual([]);
});

test("hydration size cap throws, never truncates silently", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/big.bin": "x".repeat(2048) });
  await expect(
    hydrate(store, PREFIX, work, { maxBytes: 1024 }),
  ).rejects.toThrow(/hydration limit/);
});

test("missing prefix hydrates to an empty manifest", async () => {
  const { store, work } = setup();
  expect((await hydrate(store, "ws/none/agent-x", work)).size).toBe(0);
});

test("hydrate materializes many files faithfully under concurrency", async () => {
  const { storeRoot, store, work } = setup();
  const files: Record<string, string> = {};
  for (let i = 0; i < 60; i++) files[`workspace/f${i}.txt`] = `content-${i}`;
  seed(storeRoot, PREFIX, files);

  const manifest = await hydrate(store, PREFIX, work, { concurrency: 16 });
  expect(manifest.size).toBe(60);
  for (let i = 0; i < 60; i++) {
    expect(readFileSync(join(work, "workspace", `f${i}.txt`), "utf8")).toBe(
      `content-${i}`,
    );
  }
});

test("a non-finite concurrency override still hydrates everything", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a", "workspace/b.txt": "b" });
  // NaN would size the worker pool to zero and return a successful EMPTY
  // manifest — the partial-manifest state the hydration latch must prevent.
  const manifest = await hydrate(store, PREFIX, work, {
    concurrency: Number.NaN,
  });
  expect(manifest.size).toBe(2);
  expect(readFileSync(join(work, "workspace", "a.txt"), "utf8")).toBe("a");
});

test("a download failure rejects hydrate with that error, workers stop", async () => {
  const { storeRoot, store, work } = setup();
  const files: Record<string, string> = {};
  for (let i = 0; i < 30; i++) files[`workspace/f${i}.txt`] = `content-${i}`;
  seed(storeRoot, PREFIX, files);

  let downloads = 0;
  const flaky = {
    list: (prefix: string) => store.list(prefix),
    download: async (key: string, dest: string) => {
      downloads += 1;
      if (key.endsWith("f7.txt")) throw new Error("store download exploded");
      return store.download(key, dest);
    },
    upload: (src: string, key: string) => store.upload(src, key),
    delete: (key: string) => store.delete(key),
  };
  await expect(
    hydrate(flaky, PREFIX, work, { concurrency: 8 }),
  ).rejects.toThrow("store download exploded");
  // The failure parks the pool: no worker takes new work afterwards, so at
  // most the in-flight batch (< concurrency) follows the failing download.
  expect(downloads).toBeLessThan(30);
});
