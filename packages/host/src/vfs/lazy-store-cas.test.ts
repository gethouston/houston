import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type HydrateManifest,
  LocalDirStore,
  type ObjectMetadata,
  type ObjectStore,
  syncBack,
  type WriteOptions,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { LazyStoreVfs } from "./lazy-store";
import { LazyReadRefusedError } from "./lazy-store-types";

/**
 * The CAS guard behind lazy ownership: a generation-minting store must see
 * `ifGenerationMatch` on every upload/delete of a key the op never read,
 * and create-only ("0") on a key the store never had.
 */

const PREFIX = "ws/w1/agent-1";

function generationStore(root: string) {
  const inner = new LocalDirStore(root);
  const writes: {
    op: "upload" | "delete";
    key: string;
    opts?: WriteOptions;
  }[] = [];
  const generations = new Map<string, string>();
  const store: ObjectStore & {
    writes: typeof writes;
    manifest: NonNullable<ObjectStore["manifest"]>;
  } = {
    writes,
    list: (p) => inner.list(p),
    manifest: async (p) =>
      (await inner.manifest(p)).map(
        (o): ObjectMetadata => ({
          ...o,
          generation: generations.get(o.key) ?? "7",
        }),
      ),
    download: (key, dest) => inner.download(key, dest),
    upload: async (src, key, opts) => {
      writes.push({ op: "upload", key, opts });
      await inner.upload(src, key);
      return { generation: "8" };
    },
    delete: async (key, opts) => {
      writes.push({ op: "delete", key, opts });
      await inner.delete(key);
    },
  };
  return store;
}

async function seeded(extra: Record<string, string> = {}) {
  const storeRoot = mkdtempSync(join(tmpdir(), "lazy-cas-"));
  for (const [rel, body] of Object.entries({
    "workspaces/P/Bob/CLAUDE.md": "# Bob\n",
    "workspaces/P/Bob/a.txt": "a",
    "workspaces/P/Bob/dir/b.txt": "b",
    ...extra,
  })) {
    const abs = join(storeRoot, PREFIX, ...rel.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  const store = generationStore(storeRoot);
  const root = mkdtempSync(join(tmpdir(), "lazy-cas-overlay-"));
  const manifest: HydrateManifest = new Map();
  const vfs = new LazyStoreVfs({
    store,
    prefix: PREFIX,
    root,
    objects: await store.manifest(PREFIX),
    manifest,
    excludes: [],
    maxObjectBytes: 1024,
    maxBytes: 2048,
  });
  return { store, root, manifest, vfs };
}

const rel = (k: string) => k.slice(PREFIX.length + 1);

test("unread overwrite, unread delete and a move all write with the recorded generation", async () => {
  const { store, root, manifest, vfs } = await seeded();
  expect(vfs.generationAware).toBe(true);
  await vfs.writeText("workspaces/P/Bob/a.txt", "A");
  await vfs.deleteKey("workspaces/P/Bob/CLAUDE.md");
  await vfs.move("workspaces/P/Bob/dir/b.txt", "workspaces/P/Bob/b2.txt");
  await syncBack(store, PREFIX, root, manifest, {
    generations: vfs.generationAware,
  });
  const byKey = Object.fromEntries(
    store.writes.map((w) => [`${w.op} ${rel(w.key)}`, w.opts]),
  );
  expect(byKey["upload workspaces/P/Bob/a.txt"]).toEqual({
    ifGenerationMatch: "7",
  });
  expect(byKey["delete workspaces/P/Bob/CLAUDE.md"]).toEqual({
    ifGenerationMatch: "7",
  });
  expect(byKey["delete workspaces/P/Bob/dir/b.txt"]).toEqual({
    ifGenerationMatch: "7",
  });
  // A key the store never had: create-only.
  expect(byKey["upload workspaces/P/Bob/b2.txt"]).toEqual({
    ifGenerationMatch: "0",
  });
});

test("a pure create on an empty ownership manifest is still create-only when the store mints generations", async () => {
  const { store, root, manifest, vfs } = await seeded();
  await vfs.writeText("workspaces/P/Bob/fresh.txt", "new");
  expect(manifest.size).toBe(0);
  await syncBack(store, PREFIX, root, manifest, {
    generations: vfs.generationAware,
  });
  expect(store.writes).toEqual([
    {
      op: "upload",
      key: `${PREFIX}/workspaces/P/Bob/fresh.txt`,
      opts: { ifGenerationMatch: "0" },
    },
  ]);
});

test("a file where the store has a directory, or under a remote file, is refused like a real tree", async () => {
  const { vfs } = await seeded();
  await expect(vfs.writeText("workspaces/P/Bob/dir", "x")).rejects.toThrow(
    /EISDIR/,
  );
  await expect(
    vfs.writeText("workspaces/P/Bob/a.txt/child.txt", "x"),
  ).rejects.toThrow(/ENOTDIR/);
  await expect(
    vfs.move("workspaces/P/Bob/a.txt", "workspaces/P/Bob/dir"),
  ).rejects.toThrow(/EISDIR/);
  // Deleting the remote file first makes the path a legal directory.
  await vfs.deleteKey("workspaces/P/Bob/a.txt");
  await vfs.writeText("workspaces/P/Bob/a.txt/child.txt", "x");
  expect(await vfs.readText("workspaces/P/Bob/a.txt/child.txt")).toBe("x");
});

test("renaming a remote-only folder moves every descendant", async () => {
  const { vfs, store, root, manifest } = await seeded({
    "workspaces/P/Bob/dir/deep/c.txt": "c",
  });
  await vfs.move("workspaces/P/Bob/dir", "workspaces/P/Bob/renamed");
  expect(await vfs.list("workspaces/P/Bob/dir")).toEqual([]);
  expect(await vfs.list("workspaces/P/Bob/renamed")).toEqual([
    "workspaces/P/Bob/renamed/b.txt",
    "workspaces/P/Bob/renamed/deep/c.txt",
  ]);
  expect(await vfs.readText("workspaces/P/Bob/renamed/deep/c.txt")).toBe("c");
  const result = await syncBack(store, PREFIX, root, manifest);
  expect(result.uploaded.sort()).toEqual([
    "workspaces/P/Bob/renamed/b.txt",
    "workspaces/P/Bob/renamed/deep/c.txt",
  ]);
  expect(result.deleted.sort()).toEqual([
    "workspaces/P/Bob/dir/b.txt",
    "workspaces/P/Bob/dir/deep/c.txt",
  ]);
  await expect(
    vfs.move("workspaces/P/Bob/nothing-here", "workspaces/P/Bob/x"),
  ).rejects.toThrow(/source not found/);
});

test("a stale manifest size cannot smuggle an oversized object past the cap", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "lazy-stale-"));
  const abs = join(storeRoot, PREFIX, "workspaces/P/Bob/grown.bin");
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "x".repeat(4096));
  const store = new LocalDirStore(storeRoot);
  const objects = (await store.manifest(PREFIX)).map((o) => ({
    ...o,
    size: 10,
  }));
  const root = mkdtempSync(join(tmpdir(), "lazy-stale-overlay-"));
  const manifest: HydrateManifest = new Map();
  const vfs = new LazyStoreVfs({
    store,
    prefix: PREFIX,
    root,
    objects,
    manifest,
    excludes: [],
    maxObjectBytes: 1024,
    maxBytes: 1024,
  });
  await expect(
    vfs.readBytes("workspaces/P/Bob/grown.bin"),
  ).rejects.toBeInstanceOf(LazyReadRefusedError);
  expect(manifest.size).toBe(0);
  // Nothing partial left behind: a later read refuses again, not serves it.
  await expect(
    vfs.readBytes("workspaces/P/Bob/grown.bin"),
  ).rejects.toBeInstanceOf(LazyReadRefusedError);
});

test("the aggregate budget refuses once the op has materialized enough", async () => {
  const { vfs } = await seeded({
    "workspaces/P/Bob/one.bin": "1".repeat(1000),
    "workspaces/P/Bob/two.bin": "2".repeat(1000),
    "workspaces/P/Bob/three.bin": "3".repeat(1000),
  });
  await vfs.readBytes("workspaces/P/Bob/one.bin");
  await vfs.readBytes("workspaces/P/Bob/two.bin");
  await expect(vfs.readBytes("workspaces/P/Bob/three.bin")).rejects.toThrow(
    /budget/,
  );
});
