import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRoutine, docKey } from "@houston/domain";
import { FsVfs } from "@houston/host/src/vfs";
import type { RoutineRun } from "@houston/protocol";
import type { WireFrame } from "@houston/runtime-client";
import {
  fileSha256,
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ROUTINE_HEAL_BUDGET_MS } from "./op-routine-heal";
import { fakePoolStore, POOL_STORE_URL } from "./pool-store.test-support";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnLanded } from "./turn-landed";
import { RoutineTurnError } from "./turn-routine";
import {
  answerRoutineStartFailure,
  startRoutineRun,
} from "./turn-routine-start";
import type { TurnRequest } from "./types";

const WS = "workspaces/Personal/Bob";
const ROUTINES = docKey(WS, "routines");
const RUNS = docKey(WS, "routine_runs");
const NOW = "2026-09-29T11:00:00.000Z";
const routine = createRoutine(
  { name: "Digest", prompt: "check", schedule: "0 9 * * *" },
  "r1",
  "2026-09-29T10:00:00.000Z",
);

let root: string;
let objects: Map<string, { body: string; generation: number }>;
let uploadError: Error | undefined;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "routine-start-"));
  objects = new Map();
  uploadError = undefined;
  landedFrames = [];
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const store: ObjectStore = {
  list: async () => [...objects.keys()],
  manifest: async () =>
    [...objects].map(([key, { body, generation }]) => ({
      key,
      size: body.length,
      md5: "",
      updated: NOW,
      generation: String(generation),
    })),
  download: async (key, dest) => {
    const object = objects.get(key);
    if (!object) throw new ObjectNotFoundError(key, "404");
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, object.body);
  },
  upload: async (source, key, options) => {
    if (uploadError) throw uploadError;
    const generation = objects.get(key)?.generation ?? 0;
    if (
      options?.ifGenerationMatch !== undefined &&
      options.ifGenerationMatch !== String(generation)
    )
      throw new StoreConflictError(key, `412 at ${generation}`);
    objects.set(key, {
      body: await readFile(source, "utf8"),
      generation: generation + 1,
    });
    return { generation: String(generation + 1) };
  },
  delete: async () => undefined,
};

const running = (id: string): RoutineRun => ({
  id,
  routine_id: "r1",
  status: "running",
  session_key: "routine-r1",
  started_at: NOW,
});

async function sandbox(hydrated: RoutineRun[], stored = hydrated) {
  const put = async (key: string, body: string) => {
    await mkdir(dirname(join(root, key)), { recursive: true });
    await writeFile(join(root, key), body);
  };
  await put(ROUTINES, JSON.stringify([routine]));
  await put(RUNS, JSON.stringify(hydrated));
  objects.set(ROUTINES, { body: JSON.stringify([routine]), generation: 1 });
  objects.set(RUNS, {
    body: JSON.stringify(stored),
    generation: stored === hydrated ? 1 : 2,
  });
  const hashed = async (key: string) => {
    const size = (await readFile(join(root, key))).length;
    return { hash: await fileSha256(join(root, key), size), generation: "1" };
  };
  return {
    storeRoot: root,
    workspaceRel: WS,
    workspaceDir: join(root, WS),
    dataRel: `${WS}/.houston/runtime`,
    vfs: new FsVfs(root),
    manifest: new Map([
      [ROUTINES, await hashed(ROUTINES)],
      [RUNS, await hashed(RUNS)],
    ]),
    generationAware: true,
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
}

function docServer() {
  const puts: unknown[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    if (!init?.method || init.method === "GET")
      return Response.json({ error: "document not found" }, { status: 404 });
    puts.push((JSON.parse(String(init.body)) as { doc: unknown }).doc);
    return Response.json({ revision: 1 });
  }) as typeof fetch;
  return {
    puts,
    deps: {
      poolStoreUrl: "https://store.example",
      fetchImpl,
    } as TurnServerDeps,
  };
}

const turn = {
  workspaceId: "w1",
  agentId: "bob",
  conversationId: "routine-r1",
  gcsPrefix: "ws/w1/bob",
  hostToken: "host-token",
  claim: {
    id: "1",
    bootId: "boot",
    token: "2",
    heartbeatUrl: "https://store.example/hb",
  },
  routine: { id: "r1" },
  text: "",
  credential: null,
} as unknown as TurnRequest;

let landedFrames: WireFrame[] = [];

const start = (filesystem: TurnFilesystem, deps: TurnServerDeps) => {
  const resolved = { store, prefix: "" };
  const landed = createTurnLanded({
    deps,
    turn: { ...turn, turnId: "t1" },
    filesystem,
    source: resolved,
    emit: (frame) => landedFrames.push(frame),
  });
  filesystem.landed = landed;
  return startRoutineRun({
    deps,
    turn,
    turnId: "t1",
    filesystem,
    resolved,
    nowIso: NOW,
    landed,
  });
};

const stored = () =>
  JSON.parse(objects.get(RUNS)?.body ?? "[]") as RoutineRun[];

test("a pooled run's running row reaches the store and its doc before the turn runs", async () => {
  const filesystem = await sandbox([]);
  const docs = docServer();

  const phase = await start(filesystem, docs.deps);

  expect(phase.run).toMatchObject({ id: "t1", status: "running" });
  expect(stored()).toEqual([phase.run]);
  expect(docs.puts).toEqual([[phase.run]]);
  expect(landedFrames).toEqual([
    { type: "landed", data: { changed: ["RoutineRunsChanged"] }, turnId: "t1" },
  ]);
  expect(filesystem.manifest.get(RUNS)?.generation).toBe("2");
});

test("another sandbox's running row in the store holds the routine busy", async () => {
  const filesystem = await sandbox([], [running("other")]);

  await expect(start(filesystem, docServer().deps)).rejects.toBeInstanceOf(
    RoutineTurnError,
  );
  expect(stored()).toEqual([running("other")]);
  const local = JSON.parse(
    await readFile(join(root, RUNS), "utf8"),
  ) as RoutineRun[];
  expect(local.some((r) => r.id === "t1")).toBe(false);
});

test("a store that cannot take the row fails the start instead of running from a stale copy", async () => {
  const filesystem = await sandbox([]);
  uploadError = new Error("store unavailable");
  const docs = docServer();

  await expect(start(filesystem, docs.deps)).rejects.toThrow(
    "store unavailable",
  );
  expect(stored()).toEqual([]);
  expect(docs.puts).toEqual([]);
  expect(landedFrames).toEqual([]);
  const local = JSON.parse(
    await readFile(join(root, RUNS), "utf8"),
  ) as RoutineRun[];
  expect(local).toEqual([]);
});

test("a history that changes under every attempt reads as busy", async () => {
  const filesystem = await sandbox([]);
  uploadError = new StoreConflictError(RUNS, "412");

  const error = await start(filesystem, docServer().deps).catch((e) => e);
  expect(error).toBeInstanceOf(RoutineTurnError);
  expect((error as RoutineTurnError).code).toBe("routine_busy");
});

test("the same turn re-dispatched after its sandbox died reuses its own running row", async () => {
  const filesystem = await sandbox([], [running("t1")]);

  const phase = await start(filesystem, docServer().deps);

  expect(phase.run.id).toBe("t1");
  expect(stored().filter((r) => r.id === "t1")).toHaveLength(1);
});

test("the same turn re-dispatched after its run settled never runs twice", async () => {
  const settled: RoutineRun = {
    ...running("t1"),
    status: "surfaced",
    completed_at: NOW,
  };
  const filesystem = await sandbox([], [settled]);

  await expect(start(filesystem, docServer().deps)).rejects.toBeInstanceOf(
    RoutineTurnError,
  );
  expect(stored()).toEqual([settled]);
});

async function sandboxWithoutRoutine() {
  const filesystem = await sandbox([]);
  objects.set(ROUTINES, { body: "[]", generation: 2 });
  await writeFile(join(root, ROUTINES), "[]");
  return filesystem;
}

function poolDeps(
  options: { failDocs?: boolean; hangPuts?: boolean; mirror?: unknown[] } = {},
) {
  const pool = fakePoolStore("ws/w1/bob");
  pool.docs.set("routines", { doc: options.mirror ?? [routine], revision: 1 });
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const isDoc = String(input).includes("/v1/pod/docs/");
    if (options.failDocs && isDoc)
      return new Response("unavailable", { status: 503 });
    if (options.hangPuts && isDoc && init?.method === "PUT")
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    return pool.fetchImpl(input as RequestInfo, init);
  }) as typeof fetch;
  const deps: Pick<
    TurnServerDeps,
    "poolStoreUrl" | "fetchImpl" | "activityDocRetryDelaysMs"
  > = { poolStoreUrl: POOL_STORE_URL, fetchImpl, activityDocRetryDelaysMs: [] };
  return { pool, deps: deps as TurnServerDeps };
}

async function errorFrame(error: unknown) {
  const frames: WireFrame[] = [];
  await answerRoutineStartFailure(
    { turnId: "t1", emit: (f) => frames.push(f), turnLog: null as never },
    error,
  );
  return frames[0] as unknown as { data: Record<string, unknown> };
}

test("a run-now of a routine the store lacks heals the routines doc before failing", async () => {
  const filesystem = await sandboxWithoutRoutine();
  const { pool, deps } = poolDeps();

  const error = await start(filesystem, deps).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(RoutineTurnError);
  expect((error as RoutineTurnError).code).toBe("no_routine");
  expect((error as RoutineTurnError).changed).toEqual(["RoutinesChanged"]);
  const puts = pool.docPuts.filter((p) => p.family === "routines");
  expect(puts).toHaveLength(1);
  expect(puts[0]?.claim).toBe("routine-r1");
  expect(JSON.stringify(puts[0]?.doc)).not.toContain('"r1"');
  expect(stored()).toEqual([]);
  expect((await errorFrame(error)).data).toMatchObject({
    code: "no_routine",
    changed: ["RoutinesChanged"],
  });
});

test("a heal whose doc never lands still fails no_routine and announces nothing", async () => {
  const filesystem = await sandboxWithoutRoutine();
  const { pool, deps } = poolDeps({ failDocs: true });

  const error = await start(filesystem, deps).catch((e: unknown) => e);

  expect((error as RoutineTurnError).code).toBe("no_routine");
  expect((error as RoutineTurnError).changed).toEqual([]);
  expect(pool.docPuts).toEqual([]);
  expect((await errorFrame(error)).data.changed).toBeUndefined();
});

test("a busy routine re-projects nothing", async () => {
  const filesystem = await sandbox([], [running("other")]);
  const { pool, deps } = poolDeps();

  const error = await start(filesystem, deps).catch((e: unknown) => e);

  expect((error as RoutineTurnError).code).toBe("routine_busy");
  expect(pool.docPuts.filter((p) => p.family === "routines")).toEqual([]);
});

test("a run-now whose mirror already omits the routine re-projects nothing", async () => {
  const filesystem = await sandboxWithoutRoutine();
  const { pool, deps } = poolDeps({ mirror: [] });

  const error = await start(filesystem, deps).catch((e: unknown) => e);

  expect((error as RoutineTurnError).code).toBe("no_routine");
  expect((error as RoutineTurnError).changed).toEqual([]);
  expect(pool.docPuts).toEqual([]);
  expect((await errorFrame(error)).data.changed).toBeUndefined();
});

test("a heal whose doc PUT hangs gives up within budget and announces nothing", async () => {
  const filesystem = await sandboxWithoutRoutine();
  const { pool, deps } = poolDeps({ hangPuts: true });
  const started = Date.now();

  const error = await start(filesystem, deps).catch((e: unknown) => e);

  expect(Date.now() - started).toBeLessThan(ROUTINE_HEAL_BUDGET_MS + 1_000);
  expect((error as RoutineTurnError).code).toBe("no_routine");
  expect((error as RoutineTurnError).changed).toEqual([]);
  expect(pool.docPuts).toEqual([]);
  expect((await errorFrame(error)).data.changed).toBeUndefined();
});
