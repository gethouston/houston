import { test, expect } from "bun:test";
import type { Activity, Routine, RoutineRun } from "@houston/protocol";
import { createRoutine, createRoutineRun, loadActivities, loadRoutineRuns, saveRoutineRuns, saveRoutines } from "@houston/domain";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { MemoryTurnBus } from "../turn/bus";
import { conversationKey, prefixFor } from "../turn/deps";
import { workspaceRoot } from "../routes/agent-data";
import { CloudPaths } from "../paths";
import { reconcileAgentRuns } from "./reconcile";

/**
 * Reconciliation completes a 'running' routine run by reading its conversation:
 * silent (ROUTINE_OK + suppress) vs surfaced (→ board Activity) vs timed-out.
 * Pins parity with engine/.../routines/runner.rs.
 */

const STARTED = new Date("2026-06-12T12:00:00.000Z");
const NOW = new Date("2026-06-12T12:02:00.000Z");

async function setup(routine: Routine) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  await saveRoutines(vfs, workspaceRoot(ws, agent), [routine]);
  const run = createRoutineRun(routine, "run-1", STARTED.toISOString());
  await saveRoutineRuns(vfs, workspaceRoot(ws, agent), [run]);
  return { vfs, ws, agent, run };
}

/** Drop an assistant reply into the run's conversation at ts. */
async function seedReply(vfs: MemoryVfs, ws: { id: string }, agent: { id: string }, cid: string, content: string, ts: number) {
  await vfs.writeText(
    conversationKey(prefixFor(ws as never, agent as never), cid),
    JSON.stringify({ messages: [{ role: "user", content: "go", ts: ts - 1 }, { role: "assistant", content, ts }] }),
  );
}

const deps = (vfs: MemoryVfs, now: Date) => ({
  vfs,
  paths: new CloudPaths(),
  lock: new MemoryTurnBus(),
  now: () => now,
  newId: () => "act-1",
});

const routine = (over: Partial<Routine> = {}): Routine =>
  ({ ...createRoutine({ name: "Daily", prompt: "check", schedule: "0 9 * * *" }, "r1", STARTED.toISOString()), ...over });

test("silent: suppress_when_silent + ROUTINE_OK → run silent, no activity", async () => {
  const r = routine({ suppress_when_silent: true });
  const env = await setup(r);
  await seedReply(env.vfs, env.ws, env.agent, env.run.session_key, "all quiet\nROUTINE_OK", STARTED.getTime() + 1000);

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  const { items } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  expect((items[0] as RoutineRun).status).toBe("silent");
  expect((items[0] as RoutineRun).summary).toBe("all quiet");
  expect((await loadActivities(env.vfs, workspaceRoot(env.ws, env.agent))).items).toHaveLength(0);
});

test("surfaced: a real finding → run surfaced + a needs_you board activity linked to the run", async () => {
  const r = routine({ suppress_when_silent: true, name: "Deploy watch" });
  const env = await setup(r);
  await seedReply(env.vfs, env.ws, env.agent, env.run.session_key, "Staging deploy failed.", STARTED.getTime() + 1000);

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  const { items: runs } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  expect((runs[0] as RoutineRun).status).toBe("surfaced");
  expect((runs[0] as RoutineRun).activity_id).toBe("act-1");

  const { items: activities } = await loadActivities(env.vfs, workspaceRoot(env.ws, env.agent));
  expect(activities).toHaveLength(1);
  expect(activities[0] as Activity).toMatchObject({
    id: "act-1",
    title: "Deploy watch",
    status: "needs_you",
    session_key: env.run.session_key,
    routine_id: "r1",
    routine_run_id: "run-1",
  });
});

test("a reply BEFORE the run started is ignored (shared-conversation prior turns don't complete it)", async () => {
  const r = routine();
  const env = await setup(r);
  // An assistant message from a previous run, before this run's started_at.
  await seedReply(env.vfs, env.ws, env.agent, env.run.session_key, "old answer", STARTED.getTime() - 5000);

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);
  const { items } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  expect((items[0] as RoutineRun).status).toBe("running"); // still in flight
});

test("no reply past the 15-min timeout → run errored, never stuck running", async () => {
  const r = routine();
  const env = await setup(r);
  const late = new Date(STARTED.getTime() + 16 * 60 * 1000);

  await reconcileAgentRuns(deps(env.vfs, late), env.ws, env.agent);
  const { items } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  expect((items[0] as RoutineRun).status).toBe("error");
  expect((items[0] as RoutineRun).summary).toContain("timed out");
});

test("surfaced run reuses the same activity across runs (keyed by session_key)", async () => {
  const r = routine({ name: "Watcher" });
  const env = await setup(r);
  await seedReply(env.vfs, env.ws, env.agent, env.run.session_key, "finding one", STARTED.getTime() + 1000);
  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  // A second run of the SAME routine (shared conversation), later reply.
  const run2 = createRoutineRun(r, "run-2", new Date(NOW.getTime() + 1000).toISOString());
  const { items: afterFirst } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  await saveRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent), [run2, ...afterFirst]);
  await seedReply(env.vfs, env.ws, env.agent, run2.session_key, "finding two", NOW.getTime() + 2000);

  const later = new Date(NOW.getTime() + 3000);
  await reconcileAgentRuns({ ...deps(env.vfs, later), newId: () => "act-2" }, env.ws, env.agent);

  const { items: activities } = await loadActivities(env.vfs, workspaceRoot(env.ws, env.agent));
  expect(activities).toHaveLength(1); // reused, not a second card
  expect((activities[0] as Activity).routine_run_id).toBe("run-2"); // points at the latest run
});
