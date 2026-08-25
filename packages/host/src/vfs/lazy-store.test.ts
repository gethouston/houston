import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type HydrateManifest,
  LocalDirStore,
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { runVfsContract } from "../testing/vfs-contract";
import { LazyStoreVfs } from "./lazy-store";
import { LazyReadRefusedError, UNREAD_HASH } from "./lazy-store-types";

const PREFIX = "ws/w1/agent-1";

/** A LocalDirStore that counts downloads — the whole point of laziness. */
function countingStore(root: string): ObjectStore & { downloads: string[] } {
  const inner = new LocalDirStore(root);
  const downloads: string[] = [];
  return {
    downloads,
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: (key, dest) => {
      downloads.push(key);
      return inner.download(key, dest);
    },
    upload: (src, key, o) => inner.upload(src, key, o),
    delete: (key, o) => inner.delete(key, o),
  };
}

async function seeded(files: Record<string, string> = {}) {
  const storeRoot = mkdtempSync(join(tmpdir(), "lazy-store-"));
  const defaults = {
    "workspaces/P/Bob/CLAUDE.md": "# Bob\n",
    "workspaces/P/Bob/report.csv": "a,b\n1,2\n",
    "workspaces/P/Bob/docs/notes.md": "notes",
    "workspaces/P/Bob/docs/deep/x.txt": "x",
    "workspaces/P/Bob/.houston/runtime/auth.json": "{}",
  };
  for (const [rel, body] of Object.entries({ ...defaults, ...files })) {
    const abs = join(storeRoot, PREFIX, ...rel.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  const store = countingStore(storeRoot);
  const root = mkdtempSync(join(tmpdir(), "lazy-overlay-"));
  const manifest: HydrateManifest = new Map();
  const vfs = new LazyStoreVfs({
    store,
    prefix: PREFIX,
    root,
    objects: await new LocalDirStore(storeRoot).manifest(PREFIX),
    manifest,
    excludes: ["workspaces/*/*/.houston/runtime/"],
    maxObjectBytes: 1024,
    maxBytes: 4096,
  });
  return { store, root, manifest, vfs, storeRoot };
}

// An empty store: the overlay alone must honor the full port contract.
runVfsContract("LazyStoreVfs (empty store)", () => {
  const manifest: HydrateManifest = new Map();
  return new LazyStoreVfs({
    store: new LocalDirStore(mkdtempSync(join(tmpdir(), "lazy-empty-"))),
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "lazy-empty-overlay-")),
    objects: [],
    manifest,
    excludes: [],
    maxObjectBytes: 1024 * 1024,
    maxBytes: 1024 * 1024,
  });
});

test("listing comes from the manifest: sizes right, nothing downloaded, excludes hidden", async () => {
  const { vfs, store } = await seeded();
  const listed = await vfs.listDetailed("workspaces/P/Bob");
  expect(listed.map((s) => s.key)).toEqual([
    "workspaces/P/Bob/CLAUDE.md",
    "workspaces/P/Bob/docs/deep/x.txt",
    "workspaces/P/Bob/docs/notes.md",
    "workspaces/P/Bob/report.csv",
  ]);
  expect(listed.find((s) => s.key.endsWith("report.csv"))?.size).toBe(8);
  expect(listed.every((s) => s.updatedMs > 0)).toBe(true);
  expect(store.downloads).toEqual([]);
});

test("a read downloads that one object once and records its hash in the manifest", async () => {
  const { vfs, store, manifest, root } = await seeded();
  const [a, b] = await Promise.all([
    vfs.readText("workspaces/P/Bob/report.csv"),
    vfs.readText("workspaces/P/Bob/report.csv"),
  ]);
  expect(a).toBe("a,b\n1,2\n");
  expect(b).toBe(a);
  expect(store.downloads).toEqual([`${PREFIX}/workspaces/P/Bob/report.csv`]);
  expect(existsSync(join(root, "workspaces/P/Bob/report.csv"))).toBe(true);
  const entry = manifest.get("workspaces/P/Bob/report.csv");
  expect(entry?.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(manifest.size).toBe(1);
  expect(await vfs.readText("workspaces/P/Bob/missing.txt")).toBeNull();
});

test("an excluded object is unreadable and unlisted even though the store has it", async () => {
  const { vfs } = await seeded();
  expect(
    await vfs.readText("workspaces/P/Bob/.houston/runtime/auth.json"),
  ).toBeNull();
  expect(await vfs.list("workspaces/P/Bob/.houston")).toEqual([]);
});

test("an object over the per-read cap is refused before any byte is downloaded", async () => {
  const { vfs, store } = await seeded({
    "workspaces/P/Bob/big.bin": "x".repeat(2048),
  });
  await expect(
    vfs.readBytes("workspaces/P/Bob/big.bin"),
  ).rejects.toBeInstanceOf(LazyReadRefusedError);
  expect(store.downloads).toEqual([]);
  // Still listed: the Files tab shows it; only fetching it is unavailable.
  expect(await vfs.list("workspaces/P/Bob")).toContain(
    "workspaces/P/Bob/big.bin",
  );
});

test("sync-back after lazy edits: untouched objects are neither re-uploaded nor deleted", async () => {
  const { vfs, store, manifest, root, storeRoot } = await seeded();
  // Delete before read, overwrite before read, create, rename an unread one.
  await vfs.deleteKey("workspaces/P/Bob/docs/notes.md");
  await vfs.writeText("workspaces/P/Bob/report.csv", "changed");
  await vfs.writeText("workspaces/P/Bob/new.txt", "new");
  await vfs.move("workspaces/P/Bob/docs/deep/x.txt", "workspaces/P/Bob/y.txt");
  expect(manifest.get("workspaces/P/Bob/docs/notes.md")?.hash).toBe(
    UNREAD_HASH,
  );
  expect(manifest.get("workspaces/P/Bob/report.csv")?.hash).toBe(UNREAD_HASH);
  // The vfs view is already consistent before the sync.
  expect(await vfs.list("workspaces/P/Bob")).toEqual([
    "workspaces/P/Bob/CLAUDE.md",
    "workspaces/P/Bob/new.txt",
    "workspaces/P/Bob/report.csv",
    "workspaces/P/Bob/y.txt",
  ]);
  expect(await vfs.readText("workspaces/P/Bob/docs/notes.md")).toBeNull();
  expect(await vfs.readText("workspaces/P/Bob/y.txt")).toBe("x");

  const result = await syncBack(store, PREFIX, root, manifest);
  expect(result.uploaded.sort()).toEqual([
    "workspaces/P/Bob/new.txt",
    "workspaces/P/Bob/report.csv",
    "workspaces/P/Bob/y.txt",
  ]);
  expect(result.deleted.sort()).toEqual([
    "workspaces/P/Bob/docs/deep/x.txt",
    "workspaces/P/Bob/docs/notes.md",
  ]);
  // CLAUDE.md was never touched: it must survive untouched in the store.
  const remaining = (await store.list(PREFIX)).map((k) =>
    k.slice(PREFIX.length + 1),
  );
  expect(remaining.sort()).toEqual([
    "workspaces/P/Bob/.houston/runtime/auth.json",
    "workspaces/P/Bob/CLAUDE.md",
    "workspaces/P/Bob/new.txt",
    "workspaces/P/Bob/report.csv",
    "workspaces/P/Bob/y.txt",
  ]);
  expect(
    existsSync(join(storeRoot, PREFIX, "workspaces/P/Bob/CLAUDE.md")),
  ).toBe(true);
  // The only download was the move's source (a rename needs the bytes).
  expect(store.downloads).toEqual([
    `${PREFIX}/workspaces/P/Bob/docs/deep/x.txt`,
  ]);
});

test("deletePrefix tombstones every unread object under the folder", async () => {
  const { vfs, store, manifest, root } = await seeded();
  await vfs.deletePrefix("workspaces/P/Bob/docs");
  expect(await vfs.list("workspaces/P/Bob/docs")).toEqual([]);
  const result = await syncBack(store, PREFIX, root, manifest);
  expect(result.deleted.sort()).toEqual([
    "workspaces/P/Bob/docs/deep/x.txt",
    "workspaces/P/Bob/docs/notes.md",
  ]);
  expect(result.uploaded).toEqual([]);
  expect(store.downloads).toEqual([]);
});

test("a key deleted then re-created is uploaded, not deleted, by the sync", async () => {
  const { vfs, store, manifest, root } = await seeded();
  await vfs.deleteKey("workspaces/P/Bob/report.csv");
  await vfs.writeText("workspaces/P/Bob/report.csv", "again");
  expect(await vfs.readText("workspaces/P/Bob/report.csv")).toBe("again");
  const result = await syncBack(store, PREFIX, root, manifest);
  expect(result.uploaded).toEqual(["workspaces/P/Bob/report.csv"]);
  expect(result.deleted).toEqual([]);
});

test("moving a missing or deleted source throws like the real filesystem", async () => {
  const { vfs } = await seeded();
  await expect(
    vfs.move("workspaces/P/Bob/nope.txt", "workspaces/P/Bob/x.txt"),
  ).rejects.toThrow(/source not found/);
  await vfs.deleteKey("workspaces/P/Bob/report.csv");
  await expect(
    vfs.move("workspaces/P/Bob/report.csv", "workspaces/P/Bob/x.txt"),
  ).rejects.toThrow(/source not found/);
});

test("an object deleted remotely after the listing reads as absent, not a failure", async () => {
  const { vfs, storeRoot } = await seeded();
  // Another writer deleted it between the turn's listing and this first
  // read: a vanished object is a delete, never a failed turn
  // (HOUSTON-APP-5AS).
  rmSync(join(storeRoot, PREFIX, "workspaces/P/Bob/report.csv"));
  expect(await vfs.readText("workspaces/P/Bob/report.csv")).toBeNull();
  // Listings agree with the read, and the vanished key never enters the
  // sync-back manifest as something to re-create or delete.
  expect(await vfs.list("workspaces/P/Bob")).not.toContain(
    "workspaces/P/Bob/report.csv",
  );

  // Moving a vanished source fails like a missing file, not like a store error.
  rmSync(join(storeRoot, PREFIX, "workspaces/P/Bob/docs/notes.md"));
  await expect(
    vfs.move("workspaces/P/Bob/docs/notes.md", "workspaces/P/Bob/n.md"),
  ).rejects.toThrow("move: source not found");
});
