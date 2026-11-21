import {
  createRoutine,
  createRoutineRun,
  loadRoutineRuns,
  loadRoutines,
  saveRoutineRuns,
  saveRoutines,
} from "@houston/domain";
import type { ProviderError, Routine } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import type { EventHub } from "../events/hub";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { conversationKey, prefixFor } from "../turn/deps";
import { MemoryVfs } from "../vfs";
import { reconcileAgentRuns } from "./reconcile";
import { Scheduler } from "./scheduler";

const EDITED = new Date("2026-10-08T10:00:00.000Z");
const STARTED = new Date("2026-10-08T20:47:00.000Z");
const NOW = new Date("2026-10-08T20:47:30.000Z");
const RESET = "2026-10-13T05:00:00.000Z";

const limited: ProviderError = {
  kind: "usage_limit_paused",
  provider: "anthropic",
  model: "claude-fable-5",
  resets_at: RESET,
  message: "You've reached your Fable limit.",
};

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Signups", prompt: "check", schedule: "*/5 * * * *" },
    "r1",
    EDITED.toISOString(),
  ),
  ...over,
});

async function setup(r: Routine) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const root = workspaceRoot(ws, agent);
  await saveRoutines(vfs, root, [r]);
  const run = createRoutineRun(r, "run-new", STARTED.toISOString());
  await saveRoutineRuns(vfs, root, [run]);
  const emit = vi.fn();
  const events = { emit } as unknown as EventHub;
  return { store, vfs, ws, agent, root, run, events, emit };
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

test("a usage-limit run snoozes its routine until the reset and stays enabled", async () => {
  const env = await setup(routine());
  await failWith(env, limited);
  const { items: runs } = await loadRoutineRuns(env.vfs, env.root);
  expect(runs[0]).toMatchObject({
    id: "run-new",
    status: "error",
    failure: {
      code: "usage_limit",
      provider: "anthropic",
      model: "claude-fable-5",
      resets_at: RESET,
    },
  });
  const { items } = await loadRoutines(env.vfs, env.root);
  expect(items[0]).toMatchObject({
    enabled: true,
    updated_at: EDITED.toISOString(),
    snoozed: {
      reason: "usage_limit",
      provider: "anthropic",
      model: "claude-fable-5",
      until: RESET,
      at: NOW.toISOString(),
    },
  });
  expect(items[0]?.auto_paused).toBeUndefined();
  expect(env.emit).toHaveBeenCalledWith(env.ws.ownerUserId, {
    type: "RoutinesChanged",
    agentPath: env.agent.id,
  });
});

test("a snoozed routine fires nothing until its snooze ends, then fires again", async () => {
  const env = await setup(routine());
  await failWith(env, limited);
  const fire = vi.fn(async () => {});
  const scheduler = new Scheduler({
    store: env.store,
    vfs: env.vfs,
    paths: new CloudPaths(),
    lock: new MemoryTurnBus(),
    firer: { fire },
    now: () => NOW,
    newId: () => "run-2",
  });
  await scheduler.tick(new Date("2026-10-13T04:59:00.000Z"));
  await scheduler.tick(new Date("2026-10-13T04:59:59.000Z"));
  expect(fire).not.toHaveBeenCalled();
  await scheduler.tick(new Date("2026-10-13T05:05:30.000Z"));
  expect(fire).toHaveBeenCalledTimes(1);
});

test("a short rate limit snoozes nothing", async () => {
  const env = await setup(routine());
  await failWith(env, {
    kind: "rate_limited",
    provider: "anthropic",
    model: null,
    retry_after_seconds: 30,
    message: "429",
  });
  const { items } = await loadRoutines(env.vfs, env.root);
  expect(items[0]?.snoozed).toBeUndefined();
  const { items: runs } = await loadRoutineRuns(env.vfs, env.root);
  expect(runs[0]?.failure).toBeUndefined();
});

test("a run that answered lifts the snooze", async () => {
  const env = await setup(
    routine({
      snoozed: {
        reason: "usage_limit",
        provider: "anthropic",
        model: null,
        until: RESET,
        at: EDITED.toISOString(),
      },
    }),
  );
  await env.vfs.writeText(
    conversationKey(prefixFor(env.ws, env.agent), env.run.session_key),
    JSON.stringify({
      messages: [
        { role: "user", content: "go", ts: STARTED.getTime() + 1 },
        { role: "assistant", content: "Posted.", ts: STARTED.getTime() + 2 },
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
  const { items: runs } = await loadRoutineRuns(env.vfs, env.root);
  expect(["silent", "surfaced"]).toContain(runs[0]?.status);
  const { items } = await loadRoutines(env.vfs, env.root);
  expect(items[0]?.snoozed).toBeUndefined();
  expect(items[0]?.updated_at).toBe(EDITED.toISOString());
});

test("a trigger routine, or one edited after its run started, is never snoozed", async () => {
  const { schedule: _cron, ...rest } = routine();
  const trigger = await setup({ ...rest, trigger: { kind: "webhook" } });
  await failWith(trigger, limited);
  expect(
    (await loadRoutines(trigger.vfs, trigger.root)).items[0]?.snoozed,
  ).toBeUndefined();

  const edited = await setup(routine({ updated_at: NOW.toISOString() }));
  await failWith(edited, limited);
  expect(
    (await loadRoutines(edited.vfs, edited.root)).items[0]?.snoozed,
  ).toBeUndefined();
});

test("a Run now row neither snoozes nor lifts: it ran as whoever pressed it", async () => {
  const limitedEnv = await setup(routine());
  const manualRun = { ...limitedEnv.run, manual: true as const };
  await saveRoutineRuns(limitedEnv.vfs, limitedEnv.root, [manualRun]);
  await failWith(limitedEnv, limited);
  const { items: runs } = await loadRoutineRuns(
    limitedEnv.vfs,
    limitedEnv.root,
  );
  expect(runs[0]).toMatchObject({
    manual: true,
    failure: { code: "usage_limit" },
  });
  expect(
    (await loadRoutines(limitedEnv.vfs, limitedEnv.root)).items[0]?.snoozed,
  ).toBeUndefined();

  const held = {
    reason: "usage_limit" as const,
    provider: "anthropic",
    model: null,
    until: RESET,
    at: EDITED.toISOString(),
  };
  const answered = await setup(routine({ snoozed: held }));
  await saveRoutineRuns(answered.vfs, answered.root, [
    { ...answered.run, manual: true },
  ]);
  await answered.vfs.writeText(
    conversationKey(
      prefixFor(answered.ws, answered.agent),
      answered.run.session_key,
    ),
    JSON.stringify({
      messages: [
        { role: "user", content: "go", ts: STARTED.getTime() + 1 },
        { role: "assistant", content: "Posted.", ts: STARTED.getTime() + 2 },
      ],
    }),
  );
  await reconcileAgentRuns(
    {
      vfs: answered.vfs,
      paths: new CloudPaths(),
      lock: new MemoryTurnBus(),
      events: answered.events,
      now: () => NOW,
      newId: () => "act-1",
    },
    answered.ws,
    answered.agent,
  );
  expect(
    (await loadRoutines(answered.vfs, answered.root)).items[0]?.snoozed,
  ).toEqual(held);
});
