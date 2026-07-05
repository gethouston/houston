import {
  createRoutine,
  createRoutineRun,
  loadActivities,
  loadRoutineRuns,
  saveRoutineRuns,
  saveRoutines,
} from "@houston/domain";
import type { Activity, Routine, RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { conversationKey, prefixFor } from "../turn/deps";
import { MemoryVfs } from "../vfs";
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
async function seedReply(
  vfs: MemoryVfs,
  ws: { id: string },
  agent: { id: string },
  cid: string,
  content: string,
  ts: number,
  providerError?: unknown,
) {
  await vfs.writeText(
    conversationKey(prefixFor(ws as never, agent as never), cid),
    JSON.stringify({
      messages: [
        { role: "user", content: "go", ts: ts - 1 },
        {
          role: "assistant",
          content,
          ts,
          ...(providerError ? { providerError } : {}),
        },
      ],
    }),
  );
}

const deps = (vfs: MemoryVfs, now: Date) => ({
  vfs,
  paths: new CloudPaths(),
  lock: new MemoryTurnBus(),
  now: () => now,
  newId: () => "act-1",
});

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Daily", prompt: "check", schedule: "0 9 * * *" },
    "r1",
    STARTED.toISOString(),
  ),
  ...over,
});

test("silent: suppress_when_silent + ROUTINE_OK → run silent, no activity", async () => {
  const r = routine({ suppress_when_silent: true });
  const env = await setup(r);
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "all quiet\nROUTINE_OK",
    STARTED.getTime() + 1000,
  );

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect((items[0] as RoutineRun).status).toBe("silent");
  expect((items[0] as RoutineRun).summary).toBe("all quiet");
  expect(
    (await loadActivities(env.vfs, workspaceRoot(env.ws, env.agent))).items,
  ).toHaveLength(0);
});

test("surfaced: a real finding → run surfaced + a needs_you board activity linked to the run", async () => {
  const r = routine({ suppress_when_silent: true, name: "Deploy watch" });
  const env = await setup(r);
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "Staging deploy failed.",
    STARTED.getTime() + 1000,
  );

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  const { items: runs } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect((runs[0] as RoutineRun).status).toBe("surfaced");
  expect((runs[0] as RoutineRun).activity_id).toBe("act-1");

  const { items: activities } = await loadActivities(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
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
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "old answer",
    STARTED.getTime() - 5000,
  );

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);
  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect((items[0] as RoutineRun).status).toBe("running"); // still in flight
});

test("a failed turn's typed provider error surfaces as the run's error immediately", async () => {
  const r = routine();
  const env = await setup(r);
  // A provider failure persists an EMPTY assistant message carrying the typed
  // error (exec-turn). The run must error NOW with the real reason — not sit
  // out the 15-minute timeout and report a vague "timed out".
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "",
    STARTED.getTime() + 1000,
    {
      kind: "unauthenticated",
      provider: "anthropic",
      cause: "token_expired",
      message: "Your Claude session expired. Reconnect to continue.",
    },
  );

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);
  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect((items[0] as RoutineRun).status).toBe("error");
  expect((items[0] as RoutineRun).summary).toContain("session expired");
});

test("an empty successful reply completes the run (surfaced 'Nothing to report'), not a timeout", async () => {
  const r = routine();
  const env = await setup(r);
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "",
    STARTED.getTime() + 1000,
  );

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);
  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  // Parity with runner.rs: an empty response classifies (extract_run_summary →
  // "Nothing to report"), it does not read as "still in flight".
  expect((items[0] as RoutineRun).status).toBe("surfaced");
  expect((items[0] as RoutineRun).summary).toBe("Nothing to report");
});

test("no reply past the 15-min timeout → run errored, never stuck running", async () => {
  const r = routine();
  const env = await setup(r);
  const late = new Date(STARTED.getTime() + 16 * 60 * 1000);

  await reconcileAgentRuns(deps(env.vfs, late), env.ws, env.agent);
  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect((items[0] as RoutineRun).status).toBe("error");
  expect((items[0] as RoutineRun).summary).toContain("timed out");
});

test("surfaced run reuses the same activity across runs (keyed by session_key)", async () => {
  const r = routine({ name: "Watcher" });
  const env = await setup(r);
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "finding one",
    STARTED.getTime() + 1000,
  );
  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  // A second run of the SAME routine (shared conversation), later reply.
  const run2 = createRoutineRun(
    r,
    "run-2",
    new Date(NOW.getTime() + 1000).toISOString(),
  );
  const { items: afterFirst } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  await saveRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent), [
    run2,
    ...afterFirst,
  ]);
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    run2.session_key,
    "finding two",
    NOW.getTime() + 2000,
  );

  const later = new Date(NOW.getTime() + 3000);
  await reconcileAgentRuns(
    { ...deps(env.vfs, later), newId: () => "act-2" },
    env.ws,
    env.agent,
  );

  const { items: activities } = await loadActivities(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect(activities).toHaveLength(1); // reused, not a second card
  expect((activities[0] as Activity).routine_run_id).toBe("run-2"); // points at the latest run
});

test("a cancel landing mid-sweep wins — reconcile never resurrects the cancelled row", async () => {
  const r = routine();
  const env = await setup(r);
  await seedReply(
    env.vfs,
    env.ws,
    env.agent,
    env.run.session_key,
    "found something",
    STARTED.getTime() + 1000,
  );

  // Simulate the user's Stop landing while this sweep awaits I/O: the moment
  // reconcile reads the run's conversation, flip the row terminal underneath
  // it (exactly what schedule/cancel.ts does). Reconcile has already loaded
  // its runs snapshot with the row `running` — the stale snapshot must NOT be
  // saved over the cancel.
  const root = workspaceRoot(env.ws, env.agent);
  const convKey = conversationKey(
    prefixFor(env.ws as never, env.agent as never),
    env.run.session_key,
  );
  const origRead = env.vfs.readText.bind(env.vfs);
  let flipped = false;
  env.vfs.readText = async (key: string) => {
    const text = await origRead(key);
    if (!flipped && key === convKey) {
      flipped = true;
      const { items } = await loadRoutineRuns(env.vfs, root);
      await saveRoutineRuns(
        env.vfs,
        root,
        items.map((run) =>
          run.id === env.run.id
            ? {
                ...run,
                status: "cancelled" as const,
                summary: "Stopped by user",
                completed_at: NOW.toISOString(),
              }
            : run,
        ),
      );
    }
    return text;
  };

  await reconcileAgentRuns(deps(env.vfs, NOW), env.ws, env.agent);

  const { items } = await loadRoutineRuns(env.vfs, root);
  expect((items[0] as RoutineRun).status).toBe("cancelled");
  expect((items[0] as RoutineRun).summary).toBe("Stopped by user");
});
