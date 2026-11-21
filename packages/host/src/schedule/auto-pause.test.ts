import {
  createRoutine,
  createRoutineRun,
  loadRoutineRuns,
  loadRoutines,
  ROUTINE_AUTO_PAUSE_AFTER,
  saveRoutineRuns,
  saveRoutines,
} from "@houston/domain";
import type {
  ProviderError,
  Routine,
  RoutineRun,
  RoutineRunFailure,
} from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { TurnFireError } from "../channel/fire-error";
import type { EventHub } from "../events/hub";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { conversationKey, prefixFor } from "../turn/deps";
import { MemoryVfs } from "../vfs";
import { reconcileAgentRuns } from "./reconcile";
import { fireRoutineRun } from "./run";

const EDITED = new Date("2026-09-29T10:00:00.000Z");
const STARTED = new Date("2026-09-29T11:00:00.000Z");
const NOW = new Date("2026-09-29T11:00:30.000Z");
const NO_CREDITS: RoutineRunFailure = {
  code: "out_of_credits",
  provider: "anthropic",
};

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Minutely", prompt: "check", schedule: "* * * * *" },
    "r1",
    EDITED.toISOString(),
  ),
  ...over,
});

const failedRuns = (count: number): RoutineRun[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `old-${i}`,
    routine_id: "r1",
    status: "error" as const,
    session_key: "routine-r1",
    summary: "The Anthropic account is out of credits.",
    failure: NO_CREDITS,
    started_at: new Date(STARTED.getTime() - (i + 1) * 60_000).toISOString(),
  }));

async function setup(r: Routine, earlier: RoutineRun[]) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const root = workspaceRoot(ws, agent);
  await saveRoutines(vfs, root, [r]);
  const run = createRoutineRun(r, "run-new", STARTED.toISOString());
  await saveRoutineRuns(vfs, root, [run, ...earlier]);
  const emit = vi.fn();
  const events = { emit } as unknown as EventHub;
  return { vfs, ws, agent, root, run, events, emit };
}

async function failWith(
  env: Awaited<ReturnType<typeof setup>>,
  providerError: ProviderError,
) {
  await env.vfs.writeText(
    conversationKey(prefixFor(env.ws, env.agent), env.run.session_key),
    JSON.stringify({
      messages: [
        { role: "user", content: "go", ts: STARTED.getTime() + 1 },
        {
          role: "assistant",
          content: "",
          ts: STARTED.getTime() + 2,
          providerError,
        },
      ],
    }),
  );
  await reconcileAgentRuns(
    {
      vfs: env.vfs,
      paths: new CloudPaths(),
      lock: new MemoryTurnBus(),
      events: env.events,
      now: () => NOW,
      newId: () => "act-1",
    },
    env.ws,
    env.agent,
  );
}

const quota: ProviderError = {
  kind: "quota_exhausted",
  provider: "anthropic",
  model: null,
  scope: "paid_plan",
  resets_at: null,
  message: "Insufficient balance",
};

test("the run completing a streak pauses the routine with its typed reason", async () => {
  const env = await setup(routine(), failedRuns(ROUTINE_AUTO_PAUSE_AFTER - 1));
  await failWith(env, quota);

  const [saved] = (await loadRoutines(env.vfs, env.root)).items;
  expect(saved?.enabled).toBe(false);
  expect(saved?.auto_paused).toEqual({
    reason: "out_of_credits",
    provider: "anthropic",
    failures: ROUTINE_AUTO_PAUSE_AFTER,
    at: NOW.toISOString(),
  });
  const runs = (await loadRoutineRuns(env.vfs, env.root)).items;
  expect(runs.find((r) => r.id === "run-new")).toMatchObject({
    status: "error",
    failure: NO_CREDITS,
  });
  expect(env.emit).toHaveBeenCalledWith(env.ws.ownerUserId, {
    type: "RoutinesChanged",
    agentPath: env.agent.id,
  });
});

test("one failure short of the streak leaves the routine running", async () => {
  const env = await setup(routine(), failedRuns(ROUTINE_AUTO_PAUSE_AFTER - 2));
  await failWith(env, quota);
  const [saved] = (await loadRoutines(env.vfs, env.root)).items;
  expect(saved?.enabled).toBe(true);
  expect(saved?.auto_paused).toBeUndefined();
});

test("a transient failure never pauses, however long the streak before it", async () => {
  const env = await setup(routine(), failedRuns(ROUTINE_AUTO_PAUSE_AFTER * 2));
  await failWith(env, {
    kind: "rate_limited",
    provider: "anthropic",
    model: null,
    retry_after_seconds: 30,
    message: "slow down",
  });
  const [saved] = (await loadRoutines(env.vfs, env.root)).items;
  expect(saved?.enabled).toBe(true);
  expect(env.emit).not.toHaveBeenCalledWith(env.ws.ownerUserId, {
    type: "RoutinesChanged",
    agentPath: env.agent.id,
  });
});

test("a fire refused for a missing connection counts toward the streak", async () => {
  const pinned = routine({ provider: "anthropic" });
  const earlier = failedRuns(ROUTINE_AUTO_PAUSE_AFTER - 1).map((r) => ({
    ...r,
    failure: { code: "creator_not_connected", provider: "anthropic" } as const,
  }));
  const env = await setup(pinned, earlier);
  await saveRoutineRuns(env.vfs, env.root, earlier);
  const refusal = new TurnFireError("no provider", 409, "no_provider");
  await expect(
    fireRoutineRun(
      {
        vfs: env.vfs,
        paths: new CloudPaths(),
        firer: { fire: async () => Promise.reject(refusal) },
        events: env.events,
        now: () => NOW,
        newId: () => "run-fire",
      },
      env.ws,
      env.agent,
      pinned,
    ),
  ).rejects.toBe(refusal);
  const [saved] = (await loadRoutines(env.vfs, env.root)).items;
  expect(saved?.auto_paused?.reason).toBe("creator_not_connected");
  expect(saved?.enabled).toBe(false);
});
