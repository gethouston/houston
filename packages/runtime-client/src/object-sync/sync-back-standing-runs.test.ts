import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ATOMIC_TMP_SUFFIX } from "@houston/protocol";
import { expect, test } from "vitest";
import type { ObjectMetadata } from "./object-manifest";
import { type ObjectStore, StoreConflictError } from "./object-store";
import { type LocalWriteLock, syncBack } from "./sync-back";

const RUNS = "workspaces/P/Bob/.houston/routine_runs/routine_runs.json";
const run = (id: string, minute: number) => ({
  id,
  routine_id: "r1",
  status: "surfaced",
  started_at: `2026-09-30T10:0${minute}:00.000Z`,
  completed_at: `2026-09-30T10:0${minute}:30.000Z`,
});

async function standing(opts: {
  local: string;
  remote: string;
  duringRead?: string;
  lock?: (abs: string) => LocalWriteLock;
}) {
  const root = await mkdtemp(join(tmpdir(), "standing-runs-"));
  const abs = join(root, ...RUNS.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, opts.local);
  const preconditions: Array<string | undefined> = [];
  let uploaded: string | undefined;
  const store: ObjectStore = {
    list: async () => [RUNS],
    manifest: async (): Promise<ObjectMetadata[]> => [
      { key: RUNS, size: 1, md5: "", updated: "", generation: "7" },
    ],
    download: async (_key, dest) => {
      await writeFile(dest, opts.remote);
      if (opts.duringRead !== undefined) await writeFile(abs, opts.duringRead);
    },
    upload: async (source, key, options) => {
      preconditions.push(options?.ifGenerationMatch);
      if (preconditions.length === 1) throw new StoreConflictError(key, "412");
      uploaded = await readFile(source, "utf8");
      return { generation: "8" };
    },
    delete: async () => undefined,
  };
  const previous = { hash: "before", generation: "6" };
  const result = await syncBack(store, "", root, new Map([[RUNS, previous]]), {
    generations: true,
    ...(opts.lock ? { localWriteLock: opts.lock(abs) } : {}),
  });
  return {
    abs,
    result,
    previous,
    preconditions,
    uploaded: () => uploaded,
    local: () => readFile(abs, "utf8"),
  };
}

test("a runs conflict on a standing pod keeps the run a sandbox landed", async () => {
  const sync = await standing({
    local: JSON.stringify([run("pod", 2)]),
    remote: JSON.stringify([run("sandbox", 1)]),
  });

  expect(sync.preconditions).toEqual(["6", "7"]);
  const landed = JSON.parse(sync.uploaded() ?? "[]") as { id: string }[];
  expect(landed.map(({ id }) => id)).toEqual(["pod", "sandbox"]);
  expect(await sync.local()).toBe(sync.uploaded());
  expect(sync.result.conflicts).toEqual([]);
});

test("a host write landing mid-merge is kept for the next pass, never clobbered", async () => {
  const hostWrite = JSON.stringify([run("fired", 3), run("pod", 2)]);
  const sync = await standing({
    local: JSON.stringify([run("pod", 2)]),
    remote: JSON.stringify([run("sandbox", 1)]),
    duringRead: hostWrite,
  });

  expect(await sync.local()).toBe(hostWrite);
  expect(sync.preconditions).toEqual(["6"]);
  expect(sync.result.uploaded).toEqual([]);
  expect(sync.result.conflicts).toEqual([
    { key: RUNS, reason: `${RUNS} changed locally during its merge` },
  ]);
  expect(sync.result.manifest.get(RUNS)).toEqual(sync.previous);
});

function generationStore(initial: string, onRead: () => void) {
  let body = initial;
  let generation = 7;
  let reads = 0;
  const store: ObjectStore = {
    list: async () => [RUNS],
    manifest: async (): Promise<ObjectMetadata[]> => [
      { key: RUNS, size: 1, md5: "", updated: "", generation: `${generation}` },
    ],
    download: async (_key, dest) => {
      await writeFile(dest, body);
      if (++reads === 1) onRead();
    },
    upload: async (source, key, options) => {
      const bytes = await readFile(source, "utf8");
      if (options?.ifGenerationMatch !== `${generation}`)
        throw new StoreConflictError(key, `412 at ${generation}`);
      body = bytes;
      generation += 1;
      return { generation: `${generation}` };
    },
    delete: async () => undefined,
  };
  return { store, remote: () => JSON.parse(body) as { id: string }[] };
}

function runsQueue() {
  let tail = Promise.resolve();
  return <T>(_relativePath: string, fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

test("a host fire spanning the daemon's merge keeps both its row and the sandbox's", async () => {
  const root = await mkdtemp(join(tmpdir(), "standing-runs-lock-"));
  const abs = join(root, ...RUNS.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify([run("pod", 2)]));
  const lock = runsQueue();
  let fire: Promise<void> | undefined;
  const { store, remote } = generationStore(
    JSON.stringify([run("sandbox", 1)]),
    () => {
      fire = lock(RUNS, async () => {
        const loaded = JSON.parse(await readFile(abs, "utf8")) as unknown[];
        await new Promise((resolve) => setTimeout(resolve, 20));
        await writeFile(abs, JSON.stringify([run("fired", 3), ...loaded]));
      });
    },
  );
  const sync = (manifest: Map<string, { hash: string; generation?: string }>) =>
    syncBack(store, "", root, manifest, {
      generations: true,
      localWriteLock: lock,
    });

  const first = await sync(new Map([[RUNS, { hash: "b", generation: "6" }]]));
  await fire;
  await sync(first.manifest);

  expect(remote().map(({ id }) => id)).toEqual(["fired", "pod", "sandbox"]);
  expect(JSON.parse(await readFile(abs, "utf8"))).toEqual(remote());
});

test("the daemon holds the host's queue only to compare and swap in a staged merge", async () => {
  const staged: string[][] = [];
  const sync = await standing({
    local: JSON.stringify([run("pod", 2)]),
    remote: JSON.stringify([run("sandbox", 1)]),
    lock: (abs) => async (_relativePath, write) => {
      staged.push(await readdir(dirname(abs)));
      return write();
    },
  });
  expect(staged).toHaveLength(1);
  const replacements = (staged[0] ?? []).filter(
    (name) => name.endsWith(ATOMIC_TMP_SUFFIX) && !name.includes(".remote."),
  );
  expect(replacements).toHaveLength(1);
  expect(await readdir(dirname(sync.abs))).toEqual(["routine_runs.json"]);
});
