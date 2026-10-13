import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRoutine, createRoutineRun, docKey } from "@houston/domain";
import { FsVfs } from "@houston/host/src/vfs";
import type { Routine, RoutineRun, RoutineSnooze } from "@houston/protocol";
import {
  fileSha256,
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TurnServerDeps } from "./server-types";
import { finishTurnDurability } from "./turn-durability";
import type { TurnFilesystem } from "./turn-filesystem";
import { finishRoutineTurn } from "./turn-routine-finish";
import type { TurnRequest } from "./types";

/**
 * The pooled snooze: a creator's run that hit a plan usage limit holds the
 * routine in the store until the reset, someone else's run does not, and a
 * run that answered lifts a hold.
 */

const WS = "workspaces/Personal/Bob";
const ROUTINES = docKey(WS, "routines");
const RUNS = docKey(WS, "routine_runs");
const EDITED = "2026-09-29T10:00:00.000Z";
const START = Date.parse("2026-10-08T20:47:00.000Z");

let root: string;
let objects: Map<string, { body: string; generation: number }>;
beforeEach(async () => {
  // The run happens at START, before RESET: a snooze never holds past a reset
  // that has already gone by, so a wall clock past RESET rewrites `until`.
  vi.useFakeTimers({ now: START, toFake: ["Date"] });
  root = await mkdtemp(join(tmpdir(), "routine-snooze-"));
  objects = new Map();
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

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

const RESET = "2026-10-13T05:00:00.000Z";
const HELD: RoutineSnooze = {
  reason: "usage_limit",
  provider: "anthropic",
  model: null,
  until: RESET,
  at: EDITED,
};

const base: Routine = {
  ...createRoutine(
    { name: "Signups", prompt: "check", schedule: "*/5 * * * *" },
    "r1",
    EDITED,
  ),
  created_by: "felipe",
};

const LIMITED = {
  role: "assistant",
  content: "",
  ts: 1,
  turnId: "turn-1",
  providerError: {
    kind: "usage_limit_paused",
    provider: "anthropic",
    model: null,
    resets_at: RESET,
    message: "You've reached your Fable limit.",
  },
};
const ANSWERED = {
  role: "assistant",
  content: "Posted 2 signups.",
  ts: 1,
  turnId: "turn-1",
};

async function finish(
  routine: Routine,
  reply: Record<string, unknown>,
  actingSub: string | null,
) {
  const put = async (key: string, body: string) => {
    objects.set(key, { body, generation: 1 });
    await mkdir(dirname(join(root, key)), { recursive: true });
    await writeFile(join(root, key), body);
  };
  await put(ROUTINES, JSON.stringify([routine]));
  await put(RUNS, "[]");
  const hashed = async (key: string) => {
    const size = (await readFile(join(root, key))).length;
    return { hash: await fileSha256(join(root, key), size), generation: "1" };
  };
  const manifest = new Map([
    [ROUTINES, await hashed(ROUTINES)],
    [RUNS, await hashed(RUNS)],
  ]);
  const run = createRoutineRun(
    routine,
    "turn-1",
    new Date(START).toISOString(),
  );
  await writeFile(join(root, RUNS), JSON.stringify([run]));
  const conversation = join(
    root,
    WS,
    ".houston/runtime/conversations/routine-r1.json",
  );
  await mkdir(dirname(conversation), { recursive: true });
  await writeFile(conversation, JSON.stringify({ messages: [reply] }));
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
  const finished = await finishRoutineTurn({
    store,
    prefix: "",
    filesystem,
    phase: { routine, run, text: "", provider: null, actingSub },
    conversationId: "routine-r1",
  });
  expect(finished.error).toBeUndefined();
  await finishTurnDurability({
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
  return { saved, run: runs.find((r) => r.id === "turn-1") };
}

test("the creator's usage-limit run snoozes the routine in the store", async () => {
  const { saved, run } = await finish(base, LIMITED, "felipe");
  expect(run?.failure).toMatchObject({ code: "usage_limit", resets_at: RESET });
  expect(saved?.enabled).toBe(true);
  expect(saved?.snoozed).toMatchObject({ reason: "usage_limit", until: RESET });
});

test("a usage-limit run on someone else's account leaves the schedule alone", async () => {
  const { saved } = await finish(base, LIMITED, "julia");
  expect(saved?.snoozed).toBeUndefined();
});

test("a run that answered lifts the hold", async () => {
  const { saved, run } = await finish(
    { ...base, snoozed: HELD },
    ANSWERED,
    "felipe",
  );
  expect(["silent", "surfaced"]).toContain(run?.status);
  expect(saved?.snoozed).toBeUndefined();
  expect(saved?.updated_at).toBe(EDITED);
});
