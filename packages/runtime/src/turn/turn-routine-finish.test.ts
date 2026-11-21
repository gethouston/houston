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
import type { Routine, RoutineRun, RoutineRunFailure } from "@houston/protocol";
import type {
  ObjectMetadata,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { TurnFilesystem } from "./turn-filesystem";
import { finishRoutineTurn } from "./turn-routine-finish";

const WS_REL = "workspaces/Personal/Bob";
const ROUTINES_KEY = docKey(WS_REL, "routines");
const EDITED = "2026-09-29T10:00:00.000Z";

let storeRoot: string;
let remote: Map<string, string>;
let uploads: string[];

beforeEach(async () => {
  storeRoot = await mkdtemp(join(tmpdir(), "turn-finish-"));
  remote = new Map();
  uploads = [];
});
afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true });
});

const store: ObjectStore = {
  list: async () => [...remote.keys()],
  manifest: async (): Promise<ObjectMetadata[]> =>
    [...remote.entries()].map(([key, body]) => ({
      key,
      size: body.length,
      md5: "",
      updated: EDITED,
      generation: "1",
    })),
  download: async (key, dest) => {
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, remote.get(key) ?? "");
  },
  upload: async (src, key) => {
    uploads.push(key);
    remote.set(key, await readFile(src, "utf8"));
    return { generation: "2" };
  },
  delete: async () => undefined,
};

function filesystem(): TurnFilesystem {
  return {
    storeRoot,
    workspaceRel: WS_REL,
    workspaceDir: join(storeRoot, WS_REL),
    vfs: new FsVfs(storeRoot),
    manifest: new Map(),
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
}

const routine: Routine = createRoutine(
  { name: "Minutely", prompt: "check", schedule: "* * * * *" },
  "r1",
  EDITED,
);

async function seed(
  earlierFailures: number,
  failure: RoutineRunFailure = {
    code: "team_needs_reconnect",
    provider: "anthropic",
  },
) {
  const routines = JSON.stringify([routine]);
  remote.set(ROUTINES_KEY, routines);
  const local = (key: string) => join(storeRoot, key);
  await mkdir(dirname(local(ROUTINES_KEY)), { recursive: true });
  await writeFile(local(ROUTINES_KEY), routines);
  const run = createRoutineRun(routine, "turn-1", "2026-09-29T11:00:00.000Z");
  const earlier: RoutineRun[] = Array.from(
    { length: earlierFailures },
    (_, i) => ({
      id: `old-${i}`,
      routine_id: "r1",
      status: "error",
      session_key: "routine-r1",
      failure,
      started_at: new Date(
        Date.parse(run.started_at) - (i + 1) * 60_000,
      ).toISOString(),
    }),
  );
  const runsKey = docKey(WS_REL, "routine_runs");
  await mkdir(dirname(local(runsKey)), { recursive: true });
  await writeFile(local(runsKey), JSON.stringify([run, ...earlier]));
  const conversation = join(
    storeRoot,
    WS_REL,
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
  return { routine, run, text: "", provider: null };
}

async function finish(
  phase: Awaited<ReturnType<typeof seed>>,
  unconnected?: { provider?: string },
) {
  const finished = await finishRoutineTurn({
    store,
    prefix: "",
    filesystem: filesystem(),
    phase,
    conversationId: "routine-r1",
    ...(unconnected ? { unconnected } : {}),
  });
  expect(finished.error).toBeUndefined();
  return finished.afterSync?.([docKey(WS_REL, "routine_runs")]);
}

test("the settle completing a streak uploads the paused routine", async () => {
  const phase = await seed(ROUTINE_AUTO_PAUSE_AFTER - 1);
  expect(await finish(phase)).toBeUndefined();
  expect(uploads).toEqual([ROUTINES_KEY]);
  const [saved] = JSON.parse(remote.get(ROUTINES_KEY) ?? "[]") as Routine[];
  expect(saved).toMatchObject({
    enabled: false,
    auto_paused: {
      reason: "team_needs_reconnect",
      provider: "anthropic",
      failures: ROUTINE_AUTO_PAUSE_AFTER,
    },
  });
});

test("an unpinned turn with nothing connected settles as no_model and pauses on the streak", async () => {
  const phase = await seed(ROUTINE_AUTO_PAUSE_AFTER - 1, { code: "no_model" });
  expect(await finish(phase, {})).toBeUndefined();
  const runs = JSON.parse(
    (await readFile(
      join(storeRoot, docKey(WS_REL, "routine_runs")),
      "utf8",
    )) as string,
  ) as RoutineRun[];
  expect(runs.find((r) => r.id === "turn-1")?.failure).toEqual({
    code: "no_model",
  });
  const [saved] = JSON.parse(remote.get(ROUTINES_KEY) ?? "[]") as Routine[];
  expect(saved).toMatchObject({ enabled: false });
  expect(saved?.auto_paused).toEqual({
    reason: "model_unavailable",
    provider: "",
    cause: "no_model",
    failures: ROUTINE_AUTO_PAUSE_AFTER,
    at: expect.any(String),
  });
});

test("a failure short of the streak leaves the routines doc alone", async () => {
  const phase = await seed(ROUTINE_AUTO_PAUSE_AFTER - 2);
  expect(await finish(phase)).toBeUndefined();
  expect(uploads).toEqual([]);
  const [saved] = JSON.parse(remote.get(ROUTINES_KEY) ?? "[]") as Routine[];
  expect(saved?.enabled).toBe(true);
});

test("the pause is rebased on the store's routines, never the stale tree copy", async () => {
  const phase = await seed(ROUTINE_AUTO_PAUSE_AFTER - 1);
  const other = { ...routine, id: "r2", name: "Weekly" };
  remote.set(
    ROUTINES_KEY,
    JSON.stringify([{ ...routine, name: "Renamed" }, other]),
  );
  await finish(phase);
  const saved = JSON.parse(remote.get(ROUTINES_KEY) ?? "[]") as Routine[];
  expect(saved.map((r) => [r.id, r.name, r.enabled])).toEqual([
    ["r1", "Renamed", false],
    ["r2", "Weekly", true],
  ]);
});

test("a routine deleted from the store while the turn ran is not paused back", async () => {
  const phase = await seed(ROUTINE_AUTO_PAUSE_AFTER - 1);
  remote.set(ROUTINES_KEY, JSON.stringify([]));
  await finish(phase);
  expect(uploads).toEqual([]);
  expect(remote.get(ROUTINES_KEY)).toBe("[]");
});
