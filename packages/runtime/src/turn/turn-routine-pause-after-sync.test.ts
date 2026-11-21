import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createRoutine,
  createRoutineRun,
  docKey,
  ROUTINE_AUTO_PAUSE_AFTER,
} from "@houston/domain";
import { FsVfs } from "@houston/host/src/vfs";
import type { Routine, RoutineRun } from "@houston/protocol";
import {
  fileSha256,
  ObjectNotFoundError,
  type ObjectStore,
  ObjectTooLargeError,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import type { TurnFilesystem } from "./turn-filesystem";
import { finishRoutineTurn } from "./turn-routine-finish";
import type { TurnRequest } from "./types";

const WS = "workspaces/Personal/Bob";
const ROUTINES = docKey(WS, "routines");
const RUNS = docKey(WS, "routine_runs");
const EDITED = "2026-09-29T10:00:00.000Z";
const START = Date.parse("2026-09-29T11:00:00.000Z");

let root: string;
let objects: Map<string, { body: string; generation: number }>;
let refused: Set<string>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pause-after-sync-"));
  objects = new Map();
  refused = new Set();
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const store: ObjectStore = {
  list: async () => [...objects.keys()],
  manifest: async () =>
    [...objects].map(([key, { body, generation }]) => ({
      key,
      size: body.length,
      md5: "",
      updated: EDITED,
      generation: String(generation),
    })),
  download: async (key, dest) => {
    const object = objects.get(key);
    if (!object) throw new ObjectNotFoundError(key, "404");
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, object.body);
  },
  upload: async (source, key, options) => {
    if (refused.has(key)) throw new ObjectTooLargeError(key, "413");
    const generation = objects.get(key)?.generation ?? 0;
    const expected = options?.ifGenerationMatch;
    if (expected !== undefined && expected !== String(generation))
      throw new StoreConflictError(key, `412 at ${generation}`);
    objects.set(key, {
      body: await readFile(source, "utf8"),
      generation: generation + 1,
    });
    return { generation: String(generation + 1) };
  },
  delete: async () => undefined,
};

const routine: Routine = createRoutine(
  { name: "Minutely", prompt: "check", schedule: "* * * * *" },
  "r1",
  EDITED,
);

const failed = (id: string, minutesBefore: number): RoutineRun => ({
  id,
  routine_id: "r1",
  status: "error",
  session_key: "routine-r1",
  failure: { code: "team_needs_reconnect", provider: "anthropic" },
  started_at: new Date(START - minutesBefore * 60_000).toISOString(),
  completed_at: new Date(START - minutesBefore * 60_000 + 1).toISOString(),
});

async function sandbox(hydrated: RoutineRun[], landed: RoutineRun[]) {
  const put = async (key: string, body: string) => {
    objects.set(key, { body, generation: 1 });
    await mkdir(dirname(join(root, key)), { recursive: true });
    await writeFile(join(root, key), body);
  };
  await put(ROUTINES, JSON.stringify([routine]));
  await put(RUNS, JSON.stringify(hydrated));
  const hashed = async (key: string) => {
    const size = (await readFile(join(root, key))).length;
    return { hash: await fileSha256(join(root, key), size), generation: "1" };
  };
  const manifest = new Map([
    [ROUTINES, await hashed(ROUTINES)],
    [RUNS, await hashed(RUNS)],
  ]);
  objects.set(RUNS, {
    body: JSON.stringify([...landed, ...hydrated]),
    generation: 2,
  });
  const run = createRoutineRun(
    routine,
    "turn-1",
    new Date(START).toISOString(),
  );
  await writeFile(join(root, RUNS), JSON.stringify([run, ...hydrated]));
  const conversation = join(
    root,
    WS,
    ".houston/runtime/conversations/routine-r1.json",
  );
  await mkdir(dirname(conversation), { recursive: true });
  await writeFile(
    conversation,
    JSON.stringify({
      messages: [
        {
          role: "assistant",
          content: "",
          ts: 1,
          turnId: "turn-1",
          providerError: {
            kind: "unauthenticated",
            provider: "anthropic",
            cause: "token_expired",
            message: "expired",
            credential: { scope: "team" },
          },
        },
      ],
    }),
  );
  const filesystem = {
    storeRoot: root,
    workspaceRel: WS,
    workspaceDir: join(root, WS),
    dataRel: `${WS}/.houston/runtime`,
    vfs: new FsVfs(root),
    manifest,
    generationAware: true,
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
  return { filesystem, phase: { routine, run, text: "", provider: null } };
}

async function finish(hydrated: RoutineRun[], landed: RoutineRun[]) {
  const { filesystem, phase } = await sandbox(hydrated, landed);
  const finished = await finishRoutineTurn({
    store,
    prefix: "",
    filesystem,
    phase,
    conversationId: "routine-r1",
  });
  expect(finished.error).toBeUndefined();
  const durable = await finishTurnDurability({
    deps: {} as TurnServerDeps,
    turn: { conversationId: "routine-r1", turnId: "turn-1" } as TurnRequest & {
      turnId: string;
    },
    filesystem,
    resolved: { store, prefix: "" },
    heartbeat: null,
    outcome: {},
    transcript: null,
    ...(finished.afterSync ? { afterSync: finished.afterSync } : {}),
  });
  const [saved] = JSON.parse(objects.get(ROUTINES)?.body ?? "[]") as Routine[];
  const runs = JSON.parse(objects.get(RUNS)?.body ?? "[]") as RoutineRun[];
  return { durable, saved, runs };
}

const earlier = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => failed(`old-${i}`, offset + i + 1));

test("a streak an overlapping run completed in the store pauses the routine", async () => {
  const sibling = failed("sibling", 0.5);
  const { durable, saved, runs } = await finish(
    earlier(ROUTINE_AUTO_PAUSE_AFTER - 2, 1),
    [sibling],
  );
  expect(runs.map((r) => r.id)).toContain("sibling");
  expect(runs.find((r) => r.id === "turn-1")?.status).toBe("error");
  expect(saved).toMatchObject({
    enabled: false,
    auto_paused: { failures: ROUTINE_AUTO_PAUSE_AFTER },
  });
  expect(durable.outcome).toEqual({});
  expect(durable.changed).toContain("RoutinesChanged");
});

test("without the overlapping run the streak falls short and nothing pauses", async () => {
  const { saved, durable } = await finish(
    earlier(ROUTINE_AUTO_PAUSE_AFTER - 2, 1),
    [],
  );
  expect(saved?.enabled).toBe(true);
  expect(durable.changed).not.toContain("RoutinesChanged");
});

test("a run history that did not land defers the pause to the next failed run", async () => {
  refused.add(RUNS);
  const { saved, durable } = await finish(
    earlier(ROUTINE_AUTO_PAUSE_AFTER - 1, 1),
    [],
  );
  expect(saved?.enabled).toBe(true);
  expect(durable.changed).not.toContain("RoutinesChanged");
  expect(durable.sync?.incomplete?.skipped).toEqual([RUNS]);
});
