import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test, vi } from "vitest";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { syncBack } from "./sync-back";

/**
 * The worker's merge rounds on a document one side of which will not parse:
 * the pass must not throw (every later file would stay un-synced). The turn's
 * bytes overwrite the remote at its current generation, as every conflict did
 * before merges existed, and the merge record says why.
 */

const BOARD = "workspaces/P/Bob/.houston/activity/activity.json";
const ROUTINES = "workspaces/P/Bob/.houston/routines/routines.json";
const card = (id: string) => ({ id, title: id, status: "running" });

async function contended(rel: string, local: string, remote: string) {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const root = await mkdtemp(join(tmpdir(), "unmergeable-"));
  const abs = join(root, ...rel.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, local);
  await writeFile(join(root, "notes.md"), "later file");
  const landed = new Map<string, string>();
  const preconditions: Array<string | undefined> = [];
  let uploads = 0;
  const store: ObjectStore = {
    list: async () => [rel],
    download: async () => {
      throw new Error("versioned reads only");
    },
    downloadVersioned: async (_key, dest) => {
      await writeFile(dest, remote);
      return { generation: "5" };
    },
    upload: async (source, key, options) => {
      if (key === rel) {
        uploads += 1;
        preconditions.push(options?.ifGenerationMatch);
        if (uploads === 1) throw new StoreConflictError(key, "412 at 5");
      }
      landed.set(key, await readFile(source, "utf8"));
      return { generation: "6" };
    },
    delete: async () => undefined,
  };
  const result = await syncBack(
    store,
    "",
    root,
    new Map([[rel, { hash: "before", generation: "4" }]]),
    { generations: true, workerMerge: true, conflictBackoff: () => 0 },
  );
  return { result, landed, preconditions, abs };
}

test.each([
  ["a byte-order mark", `﻿${JSON.stringify([card("theirs")])}`],
  ["trailing bytes", `${JSON.stringify([card("theirs")])}\n}garbage`],
  ["a board that is not an array", JSON.stringify({ cards: [] })],
])(
  "a remote board with %s falls back to the overwrite and says so",
  async (_label, remote) => {
    const local = `${JSON.stringify([card("mine")], null, 2)}\n`;
    const { result, landed, preconditions, abs } = await contended(
      BOARD,
      local,
      remote,
    );

    expect(result.uploaded).toContain(BOARD);
    expect(result.uploaded).toContain("notes.md");
    expect(result.conflicts).toEqual([]);
    expect(landed.get(BOARD)).toBe(local);
    expect(preconditions).toEqual(["4", "5"]);
    expect(await readFile(abs, "utf8")).toBe(local);
    expect(result.merges).toHaveLength(1);
    expect(result.merges[0]).toMatchObject({ key: BOARD, attempts: 1 });
    expect(result.merges[0]?.unmergeable).toEqual(expect.any(String));
  },
);

test("an unparseable local routines file overwrites the remote instead of throwing", async () => {
  const local = "﻿[]";
  const { result, landed } = await contended(
    ROUTINES,
    local,
    JSON.stringify([{ id: "r1" }]),
  );

  expect(result.uploaded).toEqual(
    expect.arrayContaining([ROUTINES, "notes.md"]),
  );
  expect(landed.get(ROUTINES)).toBe(local);
  expect(result.merges[0]?.unmergeable).toEqual(expect.any(String));
});

test("a merge that lands rewrites the local board whole and leaves no temp file", async () => {
  const local = `${JSON.stringify([card("mine")], null, 2)}\n`;
  const { result, abs } = await contended(
    BOARD,
    local,
    JSON.stringify([card("theirs")]),
  );

  expect(result.merges).toEqual([{ key: BOARD, attempts: 1 }]);
  const merged = JSON.parse(await readFile(abs, "utf8")) as { id: string }[];
  expect(merged.map(({ id }) => id).sort()).toEqual(["mine", "theirs"]);
  expect(await readdir(dirname(abs))).toEqual(["activity.json"]);
});

test("a worker hydration keeps the board's bytes as its merge base", async () => {
  const { hydrate } = await import("./hydrate");
  const body = JSON.stringify([card("a")]);
  const store: ObjectStore = {
    list: async () => [BOARD],
    manifest: async () => [
      { key: BOARD, size: body.length, md5: "", updated: "", generation: "3" },
    ],
    download: async (_key, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, body);
    },
    upload: async () => undefined,
    delete: async () => undefined,
  };
  const dest = await mkdtemp(join(tmpdir(), "worker-hydrate-"));

  const manifest = await hydrate(store, "", dest, { keepMergeBase: true });

  expect(manifest.get(BOARD)?.mergeBase).toBe(body);
});
