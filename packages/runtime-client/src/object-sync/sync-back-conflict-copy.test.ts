import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { HydrateManifest } from "./hydrate";
import { memoryStore } from "./memory-store.test-support";
import { ObjectTooLargeError } from "./object-store";
import { syncBack } from "./sync-back";
import { conflictCopyName } from "./sync-back-conflict-copy";

const NOTES = "workspaces/Personal/Bob/notes.txt";
const COPY = "workspaces/Personal/Bob/notes (conflict 2026-11-22).txt";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "conflict-copy-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }
  return root;
}

const stale = (key: string): HydrateManifest =>
  new Map([[key, { hash: "hydrated", generation: "1" }]]);

const workerOpts = {
  generations: true,
  workerMerge: true,
  conflictCopies: () => true,
};

test("a stale turn copy lands beside the newer remote, never over it", async () => {
  const mem = memoryStore({ [NOTES]: "their edit" });
  const root = await tree({ [NOTES]: "turn edit" });
  const result = await syncBack(mem.store, "", root, stale(NOTES), workerOpts);

  expect(mem.body(NOTES)).toBe("their edit");
  expect(mem.body(COPY)).toBe("turn edit");
  expect(result.conflictCopies).toEqual([{ key: NOTES, copy: COPY }]);
  expect(result.conflicts).toEqual([]);
  expect(result.uploaded).toEqual([]);
  expect(mem.writes.at(-1)).toEqual({
    op: "put",
    key: COPY,
    ifGenerationMatch: "0",
  });
  expect(result.manifest.get(NOTES)?.generation).toBe("1");
});

test("a conflict copy of a file both sides created leaves the original unowned", async () => {
  const mem = memoryStore({ [NOTES]: "their new file" });
  const root = await tree({ [NOTES]: "turn new file" });
  const result = await syncBack(mem.store, "", root, new Map(), workerOpts);

  expect(result.conflictCopies).toEqual([{ key: NOTES, copy: COPY }]);
  expect(result.manifest.has(NOTES)).toBe(false);
  expect(mem.body(NOTES)).toBe("their new file");
});

test("a remote that already holds the turn's bytes is adopted", async () => {
  const mem = memoryStore({ [NOTES]: "same" });
  const root = await tree({ [NOTES]: "same" });
  const result = await syncBack(mem.store, "", root, stale(NOTES), workerOpts);

  expect(result.uploaded).toEqual([NOTES]);
  expect(result.conflictCopies).toEqual([]);
  expect(mem.writes).toHaveLength(1);
  expect(result.manifest.get(NOTES)?.generation).toBe(mem.generation(NOTES));
});

test("an executable file whose bytes the remote holds is rewritten to keep its bit", async () => {
  const mem = memoryStore({ [NOTES]: "#!/bin/sh\n" });
  const root = await tree({ [NOTES]: "#!/bin/sh\n" });
  await chmod(join(root, ...NOTES.split("/")), 0o755);
  const remoteAt = mem.generation(NOTES);
  const result = await syncBack(mem.store, "", root, stale(NOTES), workerOpts);

  expect(result.conflictCopies).toEqual([]);
  expect(result.uploaded).toEqual([NOTES]);
  expect(mem.writes.at(-1)).toEqual({
    op: "put",
    key: NOTES,
    ifGenerationMatch: remoteAt,
  });
});

test("a remote another writer removed is created again, create-only", async () => {
  const mem = memoryStore();
  const root = await tree({ [NOTES]: "turn edit" });
  const result = await syncBack(mem.store, "", root, stale(NOTES), workerOpts);

  expect(mem.body(NOTES)).toBe("turn edit");
  expect(result.uploaded).toEqual([NOTES]);
  expect(mem.writes.at(-1)?.ifGenerationMatch).toBe("0");
});

test("a taken conflict name moves on to the next one", async () => {
  const mem = memoryStore({ [NOTES]: "their edit", [COPY]: "older copy" });
  const root = await tree({ [NOTES]: "turn edit" });
  const result = await syncBack(mem.store, "", root, stale(NOTES), workerOpts);
  const second = "workspaces/Personal/Bob/notes (conflict 2026-11-22 2).txt";

  expect(mem.body(COPY)).toBe("older copy");
  expect(mem.body(second)).toBe("turn edit");
  expect(result.conflictCopies).toEqual([{ key: NOTES, copy: second }]);
});

test("files outside the caller's copy scope keep the refreshed retry", async () => {
  const mem = memoryStore({ [NOTES]: "their edit" });
  const root = await tree({ [NOTES]: "turn edit" });
  const result = await syncBack(mem.store, "", root, stale(NOTES), {
    ...workerOpts,
    conflictCopies: () => false,
  });

  expect(mem.body(NOTES)).toBe("turn edit");
  expect(result.conflictCopies).toEqual([]);
});

test.each([
  ["worker", workerOpts],
  ["standing", { generations: true }],
])("a %s delete of a file another writer changed keeps the remote", async (_name, opts) => {
  const mem = memoryStore({ [NOTES]: "their edit" });
  const root = await tree({});
  const first = await syncBack(mem.store, "", root, stale(NOTES), opts);

  expect(mem.body(NOTES)).toBe("their edit");
  expect(first.deleted).toEqual([]);
  expect(first.deletesKept).toEqual([
    { key: NOTES, reason: expect.any(String) },
  ]);
  expect(first.conflicts).toEqual([]);
  expect(first.manifest.has(NOTES)).toBe(false);
  expect(mem.writes).toEqual([
    { op: "delete", key: NOTES, ifGenerationMatch: "1" },
  ]);

  const writes = mem.writes.length;
  await syncBack(mem.store, "", root, first.manifest, opts);
  expect(mem.writes).toHaveLength(writes);
});

test("a delete whose remote is already gone counts as deleted", async () => {
  const mem = memoryStore({ [NOTES]: "x" });
  const original = mem.store.delete;
  mem.store.delete = async (key, options) => {
    await original(key);
    await original(key, options);
  };
  const result = await syncBack(mem.store, "", await tree({}), stale(NOTES), {
    generations: true,
  });
  expect(result.deleted).toEqual([NOTES]);
});

test.each([
  ["notes.txt", "notes (conflict D).txt"],
  ["a/b/report.final.pdf", "a/b/report.final (conflict D).pdf"],
  ["a/.env", "a/.env (conflict D)"],
  ["Makefile", "Makefile (conflict D)"],
])("conflict name of %s", (rel, want) => {
  expect(conflictCopyName(rel, "D", 1)).toBe(want);
});

test("later conflict names number themselves", () => {
  expect(conflictCopyName("a/notes.txt", "D", 3)).toBe(
    "a/notes (conflict D 3).txt",
  );
});

test("the turn's local bytes stay as they were", async () => {
  const mem = memoryStore({ [NOTES]: "their edit" });
  const root = await tree({ [NOTES]: "turn edit" });
  await syncBack(mem.store, "", root, stale(NOTES), workerOpts);
  expect(await readFile(join(root, ...NOTES.split("/")), "utf8")).toBe(
    "turn edit",
  );
});

test("a long name is trimmed so the copy still fits one file name", () => {
  const stem = "é".repeat(120);
  const copy = conflictCopyName(`a/${stem}.md`, "2026-11-22", 1);
  const name = copy.slice(2);
  expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(255);
  expect(name.endsWith(" (conflict 2026-11-22).md")).toBe(true);
  expect(copy.startsWith("a/éé")).toBe(true);
});

test("a copy the store refuses as too large is recorded, not thrown", async () => {
  const mem = memoryStore({ [NOTES]: "their edit" });
  const upload = mem.store.upload;
  mem.store.upload = async (source, key, options) => {
    if (key === COPY) throw new ObjectTooLargeError(key, "too large");
    return upload(source, key, options);
  };
  const root = await tree({ [NOTES]: "turn edit" });
  const result = await syncBack(mem.store, "", root, stale(NOTES), workerOpts);
  expect(result.skipped).toEqual([{ key: NOTES, reason: "too large" }]);
  expect(mem.body(NOTES)).toBe("their edit");
});
