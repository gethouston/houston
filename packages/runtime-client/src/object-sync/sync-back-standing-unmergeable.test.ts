import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test, vi } from "vitest";
import type { ObjectMetadata } from "./object-manifest";
import {
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "./object-store";
import { syncBack } from "./sync-back";

/**
 * The standing store sync's one merge on a document it cannot merge: the
 * remote is gone, or one side will not parse. The pass must not throw: every
 * later file would stay un-synced, pass after pass. The local bytes land at
 * the refreshed generation, as every conflict did before merges existed.
 */

const RUNS = "workspaces/P/Bob/.houston/routine_runs/routine_runs.json";
const LOCAL = JSON.stringify([
  {
    id: "pod",
    routine_id: "r1",
    status: "surfaced",
    started_at: "2026-09-30T10:02:00.000Z",
  },
]);

async function standing(remote: string | undefined) {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const root = await mkdtemp(join(tmpdir(), "standing-unmergeable-"));
  const abs = join(root, ...RUNS.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, LOCAL);
  await writeFile(join(root, "zz-later.md"), "later file");
  const landed = new Map<string, string>();
  const preconditions: Array<string | undefined> = [];
  const store: ObjectStore = {
    list: async () => (remote === undefined ? [] : [RUNS]),
    manifest: async (): Promise<ObjectMetadata[]> =>
      remote === undefined
        ? []
        : [{ key: RUNS, size: 1, md5: "", updated: "", generation: "7" }],
    download: async (key, dest) => {
      if (remote === undefined) throw new ObjectNotFoundError(key, "404");
      await writeFile(dest, remote);
    },
    upload: async (source, key, options) => {
      if (key === RUNS) {
        preconditions.push(options?.ifGenerationMatch);
        if (preconditions.length === 1)
          throw new StoreConflictError(key, "412");
      }
      landed.set(key, await readFile(source, "utf8"));
      return { generation: "8" };
    },
    delete: async () => undefined,
  };
  const result = await syncBack(
    store,
    "",
    root,
    new Map([[RUNS, { hash: "before", generation: "6" }]]),
    { generations: true },
  );
  return { result, landed, preconditions };
}

test("a run history deleted from the store is recreated from the pod's copy", async () => {
  const sync = await standing(undefined);

  expect(sync.preconditions).toEqual(["6", "0"]);
  expect(sync.landed.get(RUNS)).toBe(LOCAL);
  expect(sync.landed.get("zz-later.md")).toBe("later file");
  expect(sync.result.conflicts).toEqual([]);
});

test.each([
  ["not JSON", "{ truncated"],
  ["not an array", JSON.stringify({ runs: [] })],
])(
  "a remote run history that is %s is replaced, never wedging the pass",
  async (_label, remote) => {
    const sync = await standing(remote);

    expect(sync.preconditions).toEqual(["6", "7"]);
    expect(sync.landed.get(RUNS)).toBe(LOCAL);
    expect(sync.landed.get("zz-later.md")).toBe("later file");
    expect(sync.result.conflicts).toEqual([]);
  },
);
