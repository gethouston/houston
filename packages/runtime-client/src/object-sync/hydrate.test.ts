import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { excluded, hydrate, syncBack } from "./hydrate";
import { LocalDirStore, ObjectTooLargeError } from "./object-store";

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

test("a file deleted mid-walk is reconciled as deleted, not a failed sync", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "workspace/a.txt": "a",
    "workspace/b.txt": "b",
    "workspace/c.txt": "c",
  });
  const manifest = await hydrate(store, PREFIX, work);
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    writeFileSync(join(work, "workspace", name), `changed-${name}`);
  }
  // The first upload deletes every other local file — whichever file the walk
  // visits first, the rest vanish between the walk and their stat/read, the
  // exact race an agent rewriting session files during a sync pass produces.
  let firstUpload = true;
  const racing = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: (src: string, key: string) => {
      if (firstUpload) {
        firstUpload = false;
        for (const name of ["a.txt", "b.txt", "c.txt"]) {
          const abs = join(work, "workspace", name);
          if (abs !== src) rmSync(abs);
        }
      }
      return store.upload(src, key);
    },
    delete: (key: string) => store.delete(key),
  };
  const result = await syncBack(racing, PREFIX, work, manifest);
  expect(result.uploaded.length).toBe(1);
  expect(result.deleted.length).toBe(2);
  expect(result.manifest.size).toBe(1);
  const remaining = await store.list(PREFIX);
  expect(remaining.length).toBe(1);
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

test("an over-cap rejection skips that file, syncs the rest, and completes the delete pass", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/old.txt": "old" });
  const manifest = await hydrate(store, PREFIX, work);
  writeFileSync(join(work, "workspace", "huge.mp4"), "H".repeat(64));
  writeFileSync(join(work, "workspace", "notes.txt"), "notes");
  rmSync(join(work, "workspace", "old.txt"));
  const capped = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: (src: string, key: string) => {
      // The cap is on SIZE, not identity: the shrunken re-write must go through.
      if (statSync(src).size > 32)
        return Promise.reject(
          new ObjectTooLargeError(key, `object store PUT ${key} failed (413)`),
        );
      return store.upload(src, key);
    },
    delete: (key: string) => store.delete(key),
  };

  const result = await syncBack(capped, PREFIX, work, manifest);
  // The rest of the pass survived the rejection: other uploads AND deletes ran.
  expect(result.uploaded).toEqual(["workspace/notes.txt"]);
  expect(result.deleted).toEqual(["workspace/old.txt"]);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0]?.key).toBe("workspace/huge.mp4");
  // The skip is remembered at the file's hash: an UNCHANGED file is not
  // re-attempted next pass (a deterministic 413 can never heal on retry)...
  expect(result.manifest.has("workspace/huge.mp4")).toBe(true);
  const again = await syncBack(capped, PREFIX, work, result.manifest);
  expect(again.skipped).toEqual([]);
  expect(again.uploaded).toEqual([]);
  // ...but a CHANGED file is (it may now fit under the cap).
  writeFileSync(join(work, "workspace", "huge.mp4"), "h");
  const changed = await syncBack(capped, PREFIX, work, again.manifest);
  expect(changed.uploaded).toEqual(["workspace/huge.mp4"]);
});

test("a non-cap upload failure still aborts the pass (data loss stays loud)", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {});
  const manifest = await hydrate(store, PREFIX, work);
  writeFileSync(join(work, "workspace-fail.txt"), "x");
  const failing = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: () => Promise.reject(new Error("object store PUT failed (500)")),
    delete: (key: string) => store.delete(key),
  };
  await expect(syncBack(failing, PREFIX, work, manifest)).rejects.toThrow(
    "500",
  );
});
