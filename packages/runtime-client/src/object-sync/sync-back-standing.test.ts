import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { hydrate } from "./hydrate";
import type { ObjectMetadata } from "./object-manifest";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { syncBack } from "./sync-back";

const BOARD = "workspaces/P/Bob/.houston/activity/activity.json";
const ROUTINES = "workspaces/P/Bob/.houston/routines/routines.json";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

async function standing(
  rel: string,
  local: string,
  remote: string,
  refusals: number,
) {
  const root = await mkdtemp(join(tmpdir(), "standing-"));
  const abs = join(root, ...rel.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, local);
  const preconditions: Array<string | undefined> = [];
  const reads: string[] = [];
  let listings = 0;
  let uploaded: string | undefined;
  let uploads = 0;
  const store: ObjectStore = {
    list: async () => [rel],
    manifest: async (): Promise<ObjectMetadata[]> => {
      listings += 1;
      return [
        {
          key: rel,
          size: remote.length,
          md5: "",
          updated: "2026-09-28T00:00:00.000Z",
          generation: "7",
        },
      ];
    },
    download: async (_key, dest) => {
      reads.push("download");
      await writeFile(dest, remote);
    },
    downloadVersioned: async (_key, dest) => {
      reads.push("downloadVersioned");
      await writeFile(dest, remote);
      return { generation: "7" };
    },
    upload: async (source, key, options) => {
      uploads += 1;
      preconditions.push(options?.ifGenerationMatch);
      if (uploads <= refusals)
        throw new StoreConflictError(key, `412 #${uploads}`);
      uploaded = await readFile(source, "utf8");
      return { generation: "8" };
    },
    delete: async () => undefined,
  };
  const result = await syncBack(
    store,
    "",
    root,
    new Map([[rel, { hash: "before", generation: "6" }]]),
    { generations: true },
  );
  return {
    result,
    preconditions,
    reads,
    listings: () => listings,
    uploaded: () => uploaded,
    local: () => readFile(abs, "utf8"),
  };
}

const board = (ids: string[]) =>
  `${JSON.stringify(
    ids.map((id) => ({ id, title: id, status: "running" })),
    null,
    2,
  )}\n`;

test("a board conflict re-uploads the pod's copy over the refreshed generation", async () => {
  const mine = board(["mine"]);
  const run = await standing(BOARD, mine, board(["theirs"]), 1);

  expect(run.preconditions).toEqual(["6", "7"]);
  expect(run.listings()).toBe(1);
  expect(run.reads).toEqual([]);
  expect(run.uploaded()).toBe(mine);
  expect(await run.local()).toBe(mine);
  expect(run.result.uploaded).toEqual([BOARD]);
  expect(run.result.conflicts).toEqual([]);
  expect(run.result.manifest.get(BOARD)).toEqual({
    hash: sha(mine),
    generation: "8",
  });
  expect(run.result.merges ?? []).toEqual([]);
});

test("a board that conflicts again is recorded after the one retry", async () => {
  const mine = board(["mine"]);
  const run = await standing(BOARD, mine, board(["theirs"]), 2);

  expect(run.preconditions).toEqual(["6", "7"]);
  expect(run.result.uploaded).toEqual([]);
  expect(run.result.conflicts).toEqual([{ key: BOARD, reason: "412 #2" }]);
  expect(run.result.manifest.get(BOARD)).toEqual({
    hash: "before",
    generation: "7",
  });
  expect(await run.local()).toBe(mine);
});

test("a board that lands first time keeps no merge base", async () => {
  const mine = board(["mine"]);
  const run = await standing(BOARD, mine, board([]), 0);

  expect(run.result.manifest.get(BOARD)).toEqual({
    hash: sha(mine),
    generation: "8",
  });
});

test("a routines conflict merges once through a plain read, then records the next conflict", async () => {
  const local = JSON.stringify([{ id: "r-mine" }]);
  const landed = await standing(
    ROUTINES,
    local,
    JSON.stringify([{ id: "r-theirs" }]),
    1,
  );
  expect(landed.reads).toEqual(["download"]);
  expect(landed.preconditions).toEqual(["6", "7"]);
  const merged = JSON.parse(landed.uploaded() ?? "[]") as { id: string }[];
  expect(merged.map(({ id }) => id)).toEqual(["r-theirs", "r-mine"]);
  expect(await landed.local()).toBe(landed.uploaded());

  const lost = await standing(ROUTINES, local, JSON.stringify([]), 2);
  expect(lost.preconditions).toEqual(["6", "7"]);
  expect(lost.result.conflicts).toEqual([{ key: ROUTINES, reason: "412 #2" }]);
});

test("hydration keeps no board bytes in the manifest", async () => {
  const body = board(["a"]);
  const store: ObjectStore = {
    list: async () => [BOARD],
    manifest: async (): Promise<ObjectMetadata[]> => [
      { key: BOARD, size: body.length, md5: "", updated: "", generation: "3" },
    ],
    download: async (_key, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, body);
    },
    upload: async () => undefined,
    delete: async () => undefined,
  };
  const dest = await mkdtemp(join(tmpdir(), "standing-hydrate-"));

  const manifest = await hydrate(store, "", dest);

  expect(manifest.get(BOARD)).toEqual({ hash: sha(body), generation: "3" });
});
