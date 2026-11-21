import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { ROUTINE_RUNS_MERGE_ROUNDS } from "./routine-runs-merge";
import { syncBack } from "./sync-back";

const RUNS = "workspaces/P/Bob/.houston/routine_runs/routine_runs.json";
type Row = Record<string, unknown>;

const body = (rows: Row[]) => `${JSON.stringify(rows, null, 2)}\n`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const minute = (n: number) => String(n).padStart(2, "0");
const run = (n: number, fields: Row = {}): Row => ({
  id: `run-${n}`,
  routine_id: "r1",
  status: "surfaced",
  session_key: "routine-r1",
  started_at: `2026-09-30T10:${minute(n)}:00.000Z`,
  completed_at: `2026-09-30T10:${minute(n)}:30.000Z`,
  ...fields,
});

function versionedStore(initial: Row[]) {
  let remote = body(initial);
  let generation = 1;
  const store: ObjectStore = {
    list: async () => [RUNS],
    manifest: async () => [
      {
        key: RUNS,
        size: remote.length,
        md5: "",
        updated: "2026-09-30T10:00:00.000Z",
        generation: String(generation),
      },
    ],
    download: async (_key, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, remote);
    },
    downloadVersioned: async (_key, dest) => {
      const [bytes, read] = [remote, generation];
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
      return { generation: String(read) };
    },
    upload: async (source, key, options) => {
      const bytes = await readFile(source, "utf8");
      if (options?.ifGenerationMatch !== String(generation))
        throw new StoreConflictError(key, `412 at ${generation}`);
      remote = bytes;
      generation += 1;
      return { generation: String(generation) };
    },
    delete: async () => undefined,
  };
  return {
    store,
    remote: () => JSON.parse(remote) as Row[],
    generation: () => String(generation),
  };
}

async function sandbox(hydrated: Row[], mine: Row) {
  const root = await mkdtemp(join(tmpdir(), "runs-overlap-"));
  const abs = join(root, ...RUNS.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body([mine, ...hydrated]));
  const manifest = new Map([
    [RUNS, { hash: sha(body(hydrated)), generation: "1" }],
  ]);
  return { root, manifest, local: async () => readFile(abs, "utf8") };
}

test("eight overlapping runs of one agent all keep their row", async () => {
  const earlier = [run(0)];
  const { store, remote } = versionedStore(earlier);
  const sandboxes = await Promise.all(
    Array.from({ length: 8 }, (_, i) => sandbox(earlier, run(i + 1))),
  );

  for (const tree of sandboxes) {
    const result = await syncBack(store, "", tree.root, tree.manifest, {
      generations: true,
      workerMerge: true,
      conflictBackoff: () => 0,
    });
    expect(result.conflicts).toEqual([]);
    expect(result.uploaded).toEqual([RUNS]);
  }

  expect(remote().map((row) => row.id)).toEqual([
    "run-8",
    "run-7",
    "run-6",
    "run-5",
    "run-4",
    "run-3",
    "run-2",
    "run-1",
    "run-0",
  ]);
  expect(JSON.parse(await sandboxes[7].local())).toEqual(remote());
});

test("ten runs finishing in lockstep all land their row", async () => {
  const earlier = [run(0)];
  const { store, remote } = versionedStore(earlier);
  const sandboxes = await Promise.all(
    Array.from({ length: 10 }, (_, i) => sandbox(earlier, run(i + 1))),
  );

  const results = await Promise.all(
    sandboxes.map((tree) =>
      syncBack(store, "", tree.root, tree.manifest, {
        generations: true,
        workerMerge: true,
        conflictBackoff: () => 0,
      }),
    ),
  );

  expect(results.flatMap((result) => result.conflicts)).toEqual([]);
  expect(remote().map((row) => row.id)).toEqual(
    Array.from({ length: 11 }, (_, i) => `run-${10 - i}`),
  );
});

function racedStore(raced: number) {
  const { store, remote, generation } = versionedStore([run(0)]);
  let uploads = 0;
  const upload = store.upload.bind(store);
  const racing: ObjectStore = {
    ...store,
    upload: async (source, key, options) => {
      uploads += 1;
      if (uploads <= raced) {
        const other = await mkdtemp(join(tmpdir(), "runs-other-"));
        const file = join(other, "runs.json");
        await writeFile(file, body([run(40 + uploads), ...remote()]));
        await upload(file, key, { ifGenerationMatch: generation() });
      }
      return upload(source, key, options);
    },
  };
  return { store: racing, remote };
}

async function contendedSync(raced: number) {
  const { store, remote } = racedStore(raced);
  const tree = await sandbox([run(0)], run(1));
  const result = await syncBack(store, "", tree.root, tree.manifest, {
    generations: true,
    workerMerge: true,
    conflictBackoff: () => 0,
  });
  return { result, remote };
}

test("the run history gets ten merge rounds: it lands after nine lost ones", async () => {
  expect(ROUTINE_RUNS_MERGE_ROUNDS).toBe(10);
  const { result, remote } = await contendedSync(ROUTINE_RUNS_MERGE_ROUNDS);

  expect(result.conflicts).toEqual([]);
  expect(result.merges).toEqual([
    { key: RUNS, attempts: ROUTINE_RUNS_MERGE_ROUNDS },
  ]);
  expect(remote().map((row) => row.id)).toContain("run-1");
});

test("a run history still contended after ten rounds is a recorded conflict", async () => {
  const { result } = await contendedSync(ROUTINE_RUNS_MERGE_ROUNDS + 1);

  expect(result.uploaded).toEqual([]);
  expect(result.conflicts.map((c) => c.key)).toEqual([RUNS]);
  expect(result.merges).toEqual([
    { key: RUNS, attempts: ROUTINE_RUNS_MERGE_ROUNDS },
  ]);
});
