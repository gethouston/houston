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

/**
 * Houston's scratch files — every atomic write's temp target across host,
 * runtime and runtime-client, plus the one-off volume probe, all named with
 * `ATOMIC_TMP_SUFFIX` (`@houston/protocol`) — exist for milliseconds inside
 * the very directory a sync pass walks. Uploading one would publish a
 * half-written file, a probe artifact, or a credential mid-rewrite, as
 * workspace content.
 */
test("Houston's scratch files never reach the store", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "sync-store-"));
  const workRoot = await mkdtemp(join(tmpdir(), "sync-work-"));
  const store = new LocalDirStore(storeRoot);
  await mkdir(join(workRoot, "workspace"), { recursive: true });
  await writeFile(join(workRoot, "workspace", "report.txt"), "real");
  await writeFile(
    join(workRoot, "workspace", "report.txt.4821.k3x9f2.houston.tmp"),
    "half-written",
  );
  await writeFile(
    join(workRoot, "workspace", "houston-case-probe-ñ.4821.k3x9f2.houston.tmp"),
    "",
  );
  // The shape that matters most: a credential caught mid-rewrite. The
  // destination is excluded by name; its scratch sibling must be excluded by
  // suffix, or the secret rides the store under a name nobody excluded.
  await writeFile(join(workRoot, "credentials.json"), "{}");
  await writeFile(join(workRoot, "credentials.json.houston.tmp"), "{secret}");

  const result = await syncBack(store, "", workRoot, new Map(), {
    excludes: ["credentials.json"],
  });

  expect(result.uploaded).toEqual(["workspace/report.txt"]);
  expect(await store.list("")).toEqual(["workspace/report.txt"]);
});

/**
 * The other half of the same rule: `.tmp` is a name PEOPLE give their files,
 * and a blanket `.tmp` exclusion listed `notes.tmp` in the Files tab while
 * never syncing it — the user's work vanished at the next pod teardown with no
 * error anywhere. Only Houston's own suffix is scratch.
 */
test("a user's own .tmp file syncs back like any other file", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "sync-store-"));
  const workRoot = await mkdtemp(join(tmpdir(), "sync-work-"));
  const store = new LocalDirStore(storeRoot);
  await mkdir(join(workRoot, "workspace"), { recursive: true });
  await writeFile(join(workRoot, "workspace", "notes.tmp"), "the user's notes");
  await writeFile(join(workRoot, "workspace", "backup.1.tmp"), "a backup");

  const result = await syncBack(store, "", workRoot, new Map());

  expect(result.uploaded.sort()).toEqual([
    "workspace/backup.1.tmp",
    "workspace/notes.tmp",
  ]);
  expect((await store.list("")).sort()).toEqual([
    "workspace/backup.1.tmp",
    "workspace/notes.tmp",
  ]);
});

test("a legacy .tmp twin of an excluded secret stays out of the store", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "sync-store-"));
  const workRoot = await mkdtemp(join(tmpdir(), "sync-work-"));
  const store = new LocalDirStore(storeRoot);
  await mkdir(join(workRoot, "data"), { recursive: true });
  await mkdir(join(workRoot, ".houston", "runtime"), { recursive: true });
  await writeFile(join(workRoot, "data", "auth.json.tmp"), "{secret}");
  await writeFile(
    join(workRoot, ".houston", "runtime", "auth.json.tmp"),
    "{secret}",
  );
  await writeFile(join(workRoot, "data", "notes.tmp"), "the user's notes");

  const result = await syncBack(store, "", workRoot, new Map());

  expect(result.uploaded).toEqual(["data/notes.tmp"]);
  expect(await store.list("")).toEqual(["data/notes.tmp"]);
});
