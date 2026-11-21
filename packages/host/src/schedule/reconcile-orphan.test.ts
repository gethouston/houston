import {
  createRoutine,
  createRoutineRun,
  docKey,
  loadActivities,
  loadRoutineRuns,
  ROUTINE_RUN_TIMEOUT_MS,
  saveRoutineRuns,
  saveRoutines,
} from "@houston/domain";
import type { Routine, RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import type { RuntimeChannel } from "../ports";
import { workspaceRoot } from "../routes/agent-data";
import { podActivityStatus } from "../routes/agents-activity";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { conversationKey, prefixFor } from "../turn/deps";
import { MemoryVfs } from "../vfs";
import { reconcileAgentRuns } from "./reconcile";
import { ORPHANED_RUN_SUMMARY } from "./reconcile-decide";

const STARTED = new Date("2026-06-12T12:00:00.000Z");
const SOON = new Date(STARTED.getTime() + 2 * 60 * 1000);
const LATE = new Date(STARTED.getTime() + ROUTINE_RUN_TIMEOUT_MS + 60_000);

const routine = (id: string): Routine =>
  createRoutine(
    { name: id, prompt: "check", schedule: "0 9 * * *" },
    id,
    STARTED.toISOString(),
  );

async function setup(kept: Routine[], gone: Routine[]) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const root = workspaceRoot(ws, agent);
  await saveRoutines(vfs, root, kept);
  const runs = [...kept, ...gone].map((r) =>
    createRoutineRun(r, `run-${r.id}`, STARTED.toISOString()),
  );
  await saveRoutineRuns(vfs, root, runs);
  const reply = (cid: string, messages: unknown[]) =>
    vfs.writeText(
      conversationKey(prefixFor(ws as never, agent as never), cid),
      JSON.stringify({ messages }),
    );
  const sweep = (now: Date, abandoned?: string) =>
    reconcileAgentRuns(
      {
        vfs,
        paths: new CloudPaths(),
        lock: new MemoryTurnBus(),
        now: () => now,
        newId: () => "act-1",
      },
      ws,
      agent,
      abandoned ? { abandoned: new Set([abandoned]) } : {},
    );
  const byId = async (id: string) =>
    (await loadRoutineRuns(vfs, root)).items.find(
      (r) => r.id === id,
    ) as RoutineRun;
  return { store, ws, vfs, root, runs, reply, sweep, byId };
}

const answer = (ts: number) => [
  { role: "user", content: "go", ts: ts - 1 },
  { role: "assistant", content: "done", ts },
];

test("an orphaned run with no reply stays running inside the timeout: its turn may still be live", async () => {
  const env = await setup([], [routine("gone")]);

  await env.sweep(SOON);

  expect((await env.byId("run-gone")).status).toBe("running");
});

test("an orphaned run with no reply settles cancelled past the timeout", async () => {
  const env = await setup([], [routine("gone")]);

  await env.sweep(LATE);

  const run = await env.byId("run-gone");
  expect(run.status).toBe("cancelled");
  expect(run.summary).toBe(ORPHANED_RUN_SUMMARY);
  expect(run.completed_at).toBe(LATE.toISOString());
});

test("an orphaned run whose turn answered settles now, with no board card", async () => {
  const env = await setup([], [routine("gone")]);
  const [orphan] = env.runs as [RoutineRun];
  await env.reply(orphan.session_key, answer(STARTED.getTime() + 1000));

  await env.sweep(SOON);

  expect((await env.byId("run-gone")).status).toBe("cancelled");
  expect((await loadActivities(env.vfs, env.root)).items).toHaveLength(0);
});

test("an orphaned run whose turn is known dead settles now", async () => {
  const env = await setup([], [routine("gone")]);

  await env.sweep(SOON, "run-gone");

  const run = await env.byId("run-gone");
  expect(run.status).toBe("cancelled");
  expect(run.summary).toBe(ORPHANED_RUN_SUMMARY);
});

test("an orphaned run the engine resumed keeps running on the resume's clock", async () => {
  const env = await setup([], [routine("gone")]);
  const [orphan] = env.runs as [RoutineRun];
  const resumedAt = LATE.getTime() - 60_000;
  await env.reply(orphan.session_key, [
    {
      role: "assistant",
      content: "",
      ts: resumedAt,
      interrupted: { cause: "engine_restart", resumed: true },
    },
  ]);

  await env.sweep(LATE);

  const run = await env.byId("run-gone");
  expect(run.status).toBe("running");
  expect(run.resumed).toBe(true);
});

test("an orphan settles beside a live routine's run, and a second sweep changes nothing", async () => {
  const env = await setup([routine("kept")], [routine("gone")]);
  const kept = env.runs.find((r) => r.routine_id === "kept") as RoutineRun;
  await env.reply(kept.session_key, answer(STARTED.getTime() + 1000));

  await env.sweep(LATE);
  const first = await loadRoutineRuns(env.vfs, env.root);
  await env.sweep(new Date(LATE.getTime() + 60_000));

  expect((await env.byId("run-kept")).status).toBe("surfaced");
  expect((await env.byId("run-gone")).status).toBe("cancelled");
  expect((await loadRoutineRuns(env.vfs, env.root)).items).toEqual(first.items);
});

test("after an orphan settles, the pod's busy probe reads idle", async () => {
  const env = await setup([], [routine("gone")]);
  const idle = { busy: async () => false } as unknown as RuntimeChannel;
  const probe = () =>
    podActivityStatus({
      store: env.store,
      channels: { [env.ws.runtime]: idle },
      vfs: env.vfs,
      paths: new CloudPaths(),
    });
  expect((await probe()).busy).toBe(true);

  await env.sweep(LATE);

  expect(await probe()).toMatchObject({ busy: false, runningRoutineRuns: 0 });
});

test.each([
  ["is not an array", {}],
  ["drops a malformed entry", [{ id: "broken" }]],
])("a routines.json the reader %s settles no orphan: the file may hide a live routine", async (_, doc) => {
  const env = await setup([], [routine("gone")]);
  const [orphan] = env.runs as [RoutineRun];
  await env.reply(orphan.session_key, answer(STARTED.getTime() + 1000));
  await env.vfs.writeText(docKey(env.root, "routines"), JSON.stringify(doc));

  await env.sweep(LATE);

  expect((await env.byId("run-gone")).status).toBe("running");
});
