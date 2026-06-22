import { expect, test } from "bun:test";
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
import { hydrate, syncBack } from "./hydrate";
import { LocalDirStore } from "./object-store";

/**
 * The hydrate→run→syncBack loop is what makes "agent = a GCS prefix" real.
 * These tests pin: faithful materialization, true diffing (only changed files
 * move), remote deletion of locally-deleted files, the auth.json exclusion
 * (tokens never persist), and the size cap.
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

test("hydrate materializes the prefix and syncBack uploads only the delta", async () => {
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

  // Change one file, add one, delete one — only those move.
  writeFileSync(join(work, "workspace", "notes.txt"), "v2");
  writeFileSync(join(work, "workspace", "deck.pptx"), "DECK");
  rmSync(join(work, "workspace", "sub", "deep.txt"));

  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded.sort()).toEqual([
    "workspace/deck.pptx",
    "workspace/notes.txt",
  ]);
  expect(result.deleted).toEqual(["workspace/sub/deep.txt"]);

  // The store now reflects the new truth.
  const rehydrated = await hydrate(
    store,
    PREFIX,
    mkdtempSync(join(tmpdir(), "houston-re-")),
  );
  expect([...rehydrated.keys()].sort()).toEqual([
    "data/conversations/c1.json",
    "workspace/deck.pptx",
    "workspace/notes.txt",
  ]);
});

test("auth.json never hydrates in and never syncs out", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "data/auth.json": JSON.stringify({ leaked: "stale-token" }),
    "workspace/file.txt": "x",
  });

  const manifest = await hydrate(store, PREFIX, work);
  expect(manifest.has("data/auth.json")).toBe(false);
  // The per-turn credential is written locally AFTER hydration…
  mkdirSync(join(work, "data"), { recursive: true });
  writeFileSync(
    join(work, "data", "auth.json"),
    JSON.stringify({ access: "AT-turn" }),
  );
  const result = await syncBack(store, PREFIX, work, manifest);
  // …and must not be uploaded.
  expect(result.uploaded).toEqual([]);
  const keys = await store.list(PREFIX);
  const remoteAuth = keys.find((k) => k.endsWith("data/auth.json"));
  // The stale remote copy is untouched (excluded from the manifest, so not
  // "deleted locally" either) — and the fresh token never reached the store.
  expect(remoteAuth).toBeDefined();
});

test("an unchanged workspace uploads nothing", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a", "workspace/b.txt": "b" });
  const manifest = await hydrate(store, PREFIX, work);
  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded).toEqual([]);
  expect(result.deleted).toEqual([]);
});

test("symlinks created locally are never persisted", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  const manifest = await hydrate(store, PREFIX, work);
  symlinkSync("/etc/passwd", join(work, "workspace", "link"));
  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded).toEqual([]);
});

test("hydration size cap throws, never truncates silently", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/big.bin": "x".repeat(2048) });
  await expect(
    hydrate(store, PREFIX, work, { maxBytes: 1024 }),
  ).rejects.toThrow(/hydration limit/);
});

test("empty prefix hydrates to an empty manifest (brand-new agent)", async () => {
  const { store, work } = setup();
  const manifest = await hydrate(store, "ws/none/agent-x", work);
  expect(manifest.size).toBe(0);
});
