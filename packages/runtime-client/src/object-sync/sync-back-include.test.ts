import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fileSha256 } from "./file-hash";
import { LocalDirStore } from "./object-store";
import { syncBack } from "./sync-back";

test("include syncs only selected changes and counts the rest", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "sync-store-"));
  const workRoot = await mkdtemp(join(tmpdir(), "sync-work-"));
  const store = new LocalDirStore(storeRoot);
  const seed = async (rel: string, content: string) => {
    const path = join(workRoot, ...rel.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
    return { hash: await fileSha256(path, content.length) };
  };
  const kept = await seed("data/conversations/c1.json", "before");
  const modified = await seed("workspace/modified.txt", "before");
  const deleted = await seed("workspace/deleted.txt", "before");
  for (const rel of [
    "data/conversations/c1.json",
    "workspace/modified.txt",
    "workspace/deleted.txt",
  ]) {
    await store.upload(join(workRoot, ...rel.split("/")), rel);
  }
  const manifest = new Map([
    ["data/conversations/c1.json", kept],
    ["workspace/modified.txt", modified],
    ["workspace/deleted.txt", deleted],
  ]);

  await writeFile(join(workRoot, "data/conversations/c1.json"), "after");
  await writeFile(join(workRoot, "workspace/modified.txt"), "after");
  await rm(join(workRoot, "workspace/deleted.txt"));
  await seed("workspace/added.txt", "new");

  const result = await syncBack(store, "", workRoot, manifest, {
    include: (rel) => rel === "data/conversations/c1.json",
  });

  expect(result.uploaded).toEqual(["data/conversations/c1.json"]);
  expect(result.deleted).toEqual([]);
  expect(result.outOfScope).toBe(3);
  expect(await store.list("")).toEqual([
    "data/conversations/c1.json",
    "workspace/deleted.txt",
    "workspace/modified.txt",
  ]);
});

test("include still deletes an in-scope object the turn removed", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "sync-store-"));
  const workRoot = await mkdtemp(join(tmpdir(), "sync-work-"));
  const store = new LocalDirStore(storeRoot);
  const rotated = "data/sessions/c1/old.jsonl";
  const path = join(workRoot, ...rotated.split("/"));
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "rotated");
  await store.upload(path, rotated);
  const manifest = new Map([
    [rotated, { hash: await fileSha256(path, "rotated".length) }],
  ]);
  await rm(path);

  const result = await syncBack(store, "", workRoot, manifest, {
    include: (rel) => rel.startsWith("data/sessions/c1/"),
  });

  expect(result.deleted).toEqual([rotated]);
  expect(result.outOfScope).toBe(0);
  expect(await store.list("")).toEqual([]);
});
