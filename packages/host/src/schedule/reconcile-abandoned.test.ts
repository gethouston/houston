import {
  createRoutine,
  createRoutineRun,
  loadRoutineRuns,
  loadRoutines,
  ROUTINE_AUTO_PAUSE_AFTER,
  routineAutoPause,
  saveRoutineRuns,
  saveRoutines,
} from "@houston/domain";
import type { Routine, RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { conversationKey, prefixFor } from "../turn/deps";
import { MemoryVfs } from "../vfs";
import { reconcileAgentRuns } from "./reconcile";

const STARTED = new Date("2026-06-12T12:00:00.000Z");
const NOW = new Date("2026-06-12T12:02:00.000Z");

const EDITED = new Date(STARTED.getTime() - 24 * 60 * 60 * 1000);

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Daily", prompt: "check", schedule: "0 9 * * *" },
    "r1",
    EDITED.toISOString(),
  ),
  ...over,
});

async function setup(runs: RoutineRun[], r: Routine = routine()) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const root = workspaceRoot(ws, agent);
  await saveRoutines(vfs, root, [r]);
  await saveRoutineRuns(vfs, root, runs);
  const seed = (cid: string, messages: unknown[]) =>
    vfs.writeText(
      conversationKey(prefixFor(ws as never, agent as never), cid),
      JSON.stringify({ messages }),
    );
  const runs_ = async () => (await loadRoutineRuns(vfs, root)).items;
  return { vfs, ws, agent, root, seed, runs: runs_ };
}

const deps = (vfs: MemoryVfs, now: Date = NOW) => ({
  vfs,
  paths: new CloudPaths(),
  lock: new MemoryTurnBus(),
  now: () => now,
  newId: () => "act-1",
});

const run = (id: string, over: Partial<RoutineRun> = {}): RoutineRun => ({
  ...createRoutineRun(routine(), id, STARTED.toISOString()),
  ...over,
});

test("an abandoned run with no reply settles as interrupted now, not after the timeout", async () => {
  const env = await setup([run("t1")]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const [settled] = await env.runs();
  expect(settled?.status).toBe("error");
  expect(settled?.summary).toBe(
    "The routine was interrupted before it finished.",
  );
  expect(settled?.failure).toBeUndefined();
  expect(settled?.completed_at).toBe(NOW.toISOString());
});

test("an abandoned run whose turn did answer settles from that answer", async () => {
  const env = await setup([run("t1")]);
  await env.seed("routine-r1", [
    { role: "user", content: "check", ts: STARTED.getTime(), turnId: "t1" },
    {
      role: "assistant",
      content: "Found two new invoices.",
      ts: STARTED.getTime() + 1000,
      turnId: "t1",
    },
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const [settled] = await env.runs();
  expect(settled?.status).toBe("surfaced");
  expect(settled?.summary).toContain("Found two new invoices.");
});

test("an abandoned run whose only reply is the interruption line settles as interrupted", async () => {
  const env = await setup([run("t1")]);
  await env.seed("routine-r1", [
    { role: "user", content: "check", ts: STARTED.getTime(), turnId: "t1" },
    {
      role: "assistant",
      content: "",
      ts: STARTED.getTime() + 1000,
      turnId: "t1",
      interrupted: { cause: "engine_restart" },
    },
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const [settled] = await env.runs();
  expect(settled?.status).toBe("error");
  expect(settled?.summary).toBe(
    "The routine was interrupted before it finished.",
  );
});

test("a scoped sweep leaves other conversations' runs alone", async () => {
  const other = run("t2", { session_key: "routine-r1-t2" });
  const env = await setup([run("t1"), other]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    conversationId: "routine-r1",
    abandoned: new Set(["t1", "t2"]),
  });

  const rows = await env.runs();
  expect(rows.find((r) => r.id === "t1")?.status).toBe("error");
  expect(rows.find((r) => r.id === "t2")?.status).toBe("running");
});

test("a run that already finished is never touched, and a second sweep changes nothing", async () => {
  const finished = run("t0", {
    status: "silent",
    summary: "all quiet",
    completed_at: STARTED.toISOString(),
  });
  const env = await setup([finished, run("t1")]);
  const sweep = () =>
    reconcileAgentRuns(
      deps(env.vfs, new Date(NOW.getTime() + 60_000)),
      env.ws,
      env.agent,
      { abandoned: new Set(["t0", "t1"]) },
    );

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t0", "t1"]),
  });
  const first = await env.runs();
  await sweep();

  expect(await env.runs()).toEqual(first);
  expect(first.find((r) => r.id === "t0")).toEqual(finished);
  expect(first.find((r) => r.id === "t1")?.completed_at).toBe(
    NOW.toISOString(),
  );
});

const outOfCredits = (id: string, minutesAgo: number): RoutineRun =>
  run(id, {
    status: "error",
    started_at: new Date(STARTED.getTime() - minutesAgo * 60_000).toISOString(),
    completed_at: STARTED.toISOString(),
    summary: "out of credits",
    failure: { code: "out_of_credits", provider: "anthropic" },
  });

const earlierWalls = (count: number) =>
  Array.from({ length: count }, (_, i) => outOfCredits(`w${i}`, i + 1));

test("an interruption neither counts toward nor breaks an auto-pause streak", async () => {
  const env = await setup([
    run("t1"),
    ...earlierWalls(ROUTINE_AUTO_PAUSE_AFTER - 1),
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const { items: routines } = await loadRoutines(env.vfs, env.root);
  const r = routines[0] as Routine;
  expect(r.enabled).toBe(true);
  expect(r.auto_paused).toBeUndefined();
  const later = outOfCredits("w-next", -1);
  expect(
    routineAutoPause(r, [later, ...(await env.runs())], NOW.toISOString())
      ?.failures,
  ).toBe(ROUTINE_AUTO_PAUSE_AFTER);
});

test("an abandoned run that failed on the same wall completes the streak and pauses the routine", async () => {
  const env = await setup([
    run("t1"),
    ...earlierWalls(ROUTINE_AUTO_PAUSE_AFTER - 1),
  ]);
  await env.seed("routine-r1", [
    { role: "user", content: "check", ts: STARTED.getTime(), turnId: "t1" },
    {
      role: "assistant",
      content: "",
      ts: STARTED.getTime() + 1000,
      turnId: "t1",
      providerError: {
        kind: "quota_exhausted",
        provider: "anthropic",
        message: "credit balance too low",
      },
    },
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const [settled] = await env.runs();
  expect(settled?.failure).toEqual({
    code: "out_of_credits",
    provider: "anthropic",
  });
  const { items: routines } = await loadRoutines(env.vfs, env.root);
  expect(routines[0]?.enabled).toBe(false);
  expect(routines[0]?.auto_paused?.failures).toBe(ROUTINE_AUTO_PAUSE_AFTER);
});

test("a later turn's reply in a shared chat is not an abandoned run's answer", async () => {
  const env = await setup([run("t1")]);
  await env.seed("routine-r1", [
    { role: "user", content: "check", ts: STARTED.getTime(), turnId: "t1" },
    { role: "user", content: "hi", ts: STARTED.getTime() + 500, turnId: "t3" },
    {
      role: "assistant",
      content: "Hello there.",
      ts: STARTED.getTime() + 1000,
      turnId: "t3",
    },
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const [settled] = await env.runs();
  expect(settled?.status).toBe("error");
  expect(settled?.summary).toBe(
    "The routine was interrupted before it finished.",
  );
});

test("an abandoned run's own answer counts even when a later turn answered after it", async () => {
  const env = await setup([run("t1")]);
  await env.seed("routine-r1", [
    { role: "user", content: "check", ts: STARTED.getTime(), turnId: "t1" },
    {
      role: "assistant",
      content: "Two invoices are due.",
      ts: STARTED.getTime() + 1000,
      turnId: "t1",
    },
    { role: "user", content: "hi", ts: STARTED.getTime() + 2000, turnId: "t3" },
    {
      role: "assistant",
      content: "Hello there.",
      ts: STARTED.getTime() + 3000,
      turnId: "t3",
    },
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const [settled] = await env.runs();
  expect(settled?.status).toBe("surfaced");
  expect(settled?.summary).toContain("Two invoices are due.");
});

test("a deferred pause hands the failed routines to the caller instead of pausing here", async () => {
  const env = await setup([
    run("t1"),
    ...Array.from({ length: ROUTINE_AUTO_PAUSE_AFTER - 1 }, (_, i) =>
      run(`w${i}`, {
        status: "error",
        started_at: new Date(
          STARTED.getTime() - (i + 1) * 60_000,
        ).toISOString(),
        completed_at: STARTED.toISOString(),
        failure: { code: "out_of_credits", provider: "anthropic" },
      }),
    ),
  ]);
  await env.seed("routine-r1", [
    {
      role: "assistant",
      content: "",
      ts: STARTED.getTime() + 1000,
      turnId: "t1",
      providerError: {
        kind: "quota_exhausted",
        provider: "anthropic",
        message: "credit balance too low",
      },
    },
  ]);
  const handed: string[][] = [];

  await reconcileAgentRuns(
    {
      ...deps(env.vfs),
      settleRuns: async (settled) => {
        handed.push(settled.map((r) => r.routine_id));
      },
    },
    env.ws,
    env.agent,
    { abandoned: new Set(["t1"]) },
  );

  expect(handed).toEqual([["r1"]]);
  const { items: routines } = await loadRoutines(env.vfs, env.root);
  expect(routines[0]?.enabled).toBe(true);
});

test("an older dead run's interruption line never answers a newer run in the shared chat", async () => {
  const newer = run("t2", {
    started_at: new Date(STARTED.getTime() - 20 * 60_000).toISOString(),
  });
  const env = await setup([
    newer,
    run("t1", {
      started_at: new Date(STARTED.getTime() - 40 * 60_000).toISOString(),
    }),
  ]);
  await env.seed("routine-r1", [
    {
      role: "assistant",
      content: "",
      ts: STARTED.getTime(),
      turnId: "t1",
      interrupted: { cause: "engine_restart" },
    },
  ]);

  await reconcileAgentRuns(deps(env.vfs), env.ws, env.agent, {
    abandoned: new Set(["t1"]),
  });

  const rows = await env.runs();
  expect(rows.find((r) => r.id === "t1")?.summary).toBe(
    "The routine was interrupted before it finished.",
  );
  expect(rows.find((r) => r.id === "t2")).toMatchObject({
    status: "error",
    summary: "The routine timed out without a response.",
  });
});

test("a shadow reply from another turn never hides a run's own reply in the file", async () => {
  const env = await setup([run("t1")]);
  await env.seed("routine-r1", [
    {
      role: "assistant",
      content: "Two invoices are due.",
      ts: STARTED.getTime() + 1000,
      turnId: "t1",
    },
  ]);

  await reconcileAgentRuns(
    {
      ...deps(env.vfs),
      replyReader: {
        replyAfter: async () => ({
          role: "assistant",
          content: "Hello there.",
          ts: STARTED.getTime() + 2000,
          turnId: "t2",
        }),
      },
    },
    env.ws,
    env.agent,
  );

  const [settled] = await env.runs();
  expect(settled?.status).toBe("surfaced");
  expect(settled?.summary).toContain("Two invoices are due.");
});
