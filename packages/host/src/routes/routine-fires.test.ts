import type { Server } from "node:http";
import {
  createRoutine,
  loadRoutineRuns,
  saveRoutines,
  setPreference,
} from "@houston/domain";
import type { Capabilities, Routine } from "@houston/protocol";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import {
  TurnDeliveryUncertainError,
  TurnFireError,
  turnBusyError,
} from "../channel/fire-error";
import { MemoryCredentialStore } from "../credentials/store";
import type { FireTurnOptions } from "../fire-turn-options";
import { CloudPaths } from "../paths";
import type {
  ChannelCtx,
  RuntimeChannel,
  TokenVerifier,
  TurnPin,
} from "../ports";
import { AgentRenamingError, LauncherClosedError } from "../ports";
import { decodeFireOutcome } from "../schedule/fire-outcome";
import { ChannelRoutineFirer } from "../schedule/firer";
import { Scheduler } from "../schedule/scheduler";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

class SpyChannel implements RuntimeChannel {
  fired: {
    conversationId: string;
    text: string;
    pin?: TurnPin;
    actingUser?: string;
    actingAs?: string;
  }[] = [];
  refusal: Error | null = null;
  async dispatch() {}
  async fireTurn(
    _ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    { actingUser, actingAs }: FireTurnOptions = {},
  ) {
    if (this.refusal) throw this.refusal;
    this.fired.push({ conversationId, text, pin, actingUser, actingAs });
  }
  async cancelTurn() {
    return false;
  }
  async busy() {
    return false;
  }
  async runtimeStatus() {
    return "running" as const;
  }
  async teardown() {}
  async captureCredential() {
    return { ok: true as const, provider: "openai-codex" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveClaudeOAuthCredential() {}
  async saveCustomEndpoint() {}
}

const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};

const FIRE_AT = "2026-06-12T14:00:00.000Z";
const SINCE = new Date("2026-06-12T13:59:00.000Z");
const DUE = new Date("2026-06-12T14:00:30.000Z");

function actingAs(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `acting-v1.${payload}.signature`;
}

function routine(over: Partial<Routine> = {}): Routine {
  return {
    ...createRoutine(
      { name: "Daily report", prompt: "write it", schedule: "0 14 * * *" },
      over.id ?? "r1",
      "2026-06-12T00:00:00.000Z",
      "creator-1",
    ),
    ...over,
  };
}

let server: Server;
let base = "";
let agentId = "";
let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let channel: SpyChannel;
let bus: MemoryTurnBus;

const auth = (who = "alice") => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

async function seedRoutines(routines: Routine[]): Promise<void> {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("no agent");
  await setPreference(vfs, ws.id, "timezone", "UTC");
  await saveRoutines(vfs, workspaceRoot(ws, agent), routines);
}

async function postFire(
  body: unknown,
  headers: Record<string, string> = auth(),
) {
  return fetch(`${base}/agents/${agentId}/routine-fires`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function runs() {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("no agent");
  return (await loadRoutineRuns(vfs, workspaceRoot(ws, agent))).items;
}

beforeEach(async () => {
  store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  channel = new SpyChannel();
  bus = new MemoryTurnBus();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: { gke: channel },
    vfs,
    capabilities: CAPS,
    triggerLock: bus,
    routineFireLock: bus,
  };
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  server = createControlPlaneServer(deps);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ name: "Helper" }),
  });
  agentId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("fires a scheduled routine with the minted acting-as token", async () => {
  await seedRoutines([routine()]);
  const token = actingAs("creator-1");
  const res = await postFire({
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: token,
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "fired" });
  expect(await runs()).toHaveLength(1);
  expect(channel.fired).toHaveLength(1);
  expect(channel.fired[0]).toMatchObject({
    actingAs: token,
    actingUser: undefined,
  });
});

test("busy burns the instant without creating another run", async () => {
  await seedRoutines([routine()]);
  const token = actingAs("creator-1");
  await postFire({ routineId: "r1", fireAt: FIRE_AT, actingAs: token });
  const secondAt = "2026-06-12T15:00:00.000Z";
  const res = await postFire({
    routineId: "r1",
    fireAt: secondAt,
    actingAs: token,
  });

  expect(await res.json()).toEqual({ result: "busy" });
  expect(await runs()).toHaveLength(1);
  expect(
    decodeFireOutcome(await bus.get(`routine:fired:r1:${secondAt}`)),
  ).toEqual({
    result: "busy",
  });
});

test.each([
  [
    "an unpinned routine with no provider",
    new TurnFireError(
      'runtime 409: {"error":"No provider connected.","code":"no_provider"}',
      409,
      "no_provider",
    ),
    {
      result: "failed",
      code: "no_provider",
      error:
        'runtime 409: {"error":"No provider connected.","code":"no_provider"}',
    },

    {
      summary:
        "This routine has no model chosen, and the AI account it would use isn't connected.",
      failure: { code: "no_model" },
    },
  ],
  [
    "an uncoded runtime refusal",
    new TurnFireError("runtime 502: bad gateway", 502, null),
    { result: "failed", code: null, error: "runtime 502: bad gateway" },
  ],
  [
    "an unexpected throw",
    new Error("quota exceeded"),
    { result: "failed", code: null, error: "quota exceeded" },
  ],
  [
    "a connection lost after the turn POST",
    new TurnDeliveryUncertainError(
      Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNRESET" },
      }),
    ),
    {
      result: "failed",
      code: null,
      error:
        "the runtime connection failed mid-request (ECONNRESET); the turn may have started",
    },
  ],
  ["a taken turn slot", turnBusyError("other-chat"), { result: "busy" }],
])("%s answers 200 with a terminal result and an errored run", async (_name, refusal, expected, typedRun?: object) => {
  await seedRoutines([routine()]);
  channel.refusal = refusal;
  const body = {
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  };
  const res = await postFire(body);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(expected);
  const [run] = await runs();
  expect(run).toMatchObject({
    status: "error",
    ...(typedRun ?? { summary: refusal.message }),
  });

  const replay = await postFire(body);
  expect(await replay.json()).toEqual({ ...expected, deduped: true });
  expect(await runs()).toHaveLength(1);
});

test.each([
  ["an unexpected throw", "error", new Error("quota exceeded")],
  ["a runtime 5xx", "error", new TurnFireError("runtime 500: x", 500, null)],
  [
    "an unpinned routine with no provider",
    "warn",
    new TurnFireError("runtime 409", 409, "no_provider"),
  ],
] as const)("%s is logged at %s level", async (_name, level, refusal) => {
  await seedRoutines([routine()]);
  channel.refusal = refusal;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const tagged = (spy: typeof warn) =>
    spy.mock.calls.filter(([first]) =>
      String(first).startsWith("[routine-fires]"),
    ).length;
  try {
    const res = await postFire({
      routineId: "r1",
      fireAt: FIRE_AT,
      actingAs: actingAs("creator-1"),
    });
    expect(await res.json()).toMatchObject({ result: "failed" });
    const [used, unused] = level === "error" ? [error, warn] : [warn, error];
    expect(tagged(used)).toBe(1);
    expect(tagged(unused)).toBe(0);
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
});

test.each([
  ["a draining host", new LauncherClosedError()],
  ["a renaming agent", new AgentRenamingError("a1")],
  ["an unreachable runtime", new TypeError("fetch failed")],
  [
    "a refused turn POST",
    Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    }),
  ],
  [
    "a turn POST lost while the host drains",
    new TurnDeliveryUncertainError(
      Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNRESET" },
      }),
      true,
    ),
  ],
  [
    "a draining runtime",
    new TurnFireError(
      'runtime 503: {"error":"engine unavailable","detail":"the agent is restarting"}',
      503,
      null,
    ),
  ],
])("%s releases the instant and answers 503", async (_name, refusal) => {
  await seedRoutines([routine()]);
  channel.refusal = refusal;
  const body = {
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  };
  const res = await postFire(body);

  expect(res.status).toBe(503);
  expect(res.headers.get("retry-after")).toBe("2");
  expect(await res.json()).toEqual({
    error: "engine unavailable",
    detail: refusal.message,
  });
  expect(await bus.get(`routine:fired:r1:${FIRE_AT}`)).toBeNull();

  channel.refusal = null;
  expect(await (await postFire(body)).json()).toEqual({ result: "fired" });
  expect(channel.fired).toHaveLength(1);
});

test.each([
  ["before the run is recorded", 1, 0],
  ["when the errored mark cannot be written", 2, 1],
])("a runs-file failure %s releases the instant", async (_name, failingWrite, recorded) => {
  await seedRoutines([routine()]);
  channel.refusal = new Error("quota exceeded");
  const write = vfs.writeText.bind(vfs);
  let runWrites = 0;
  const spy = vi
    .spyOn(vfs, "writeText")
    .mockImplementation(async (key, text) => {
      if (key.includes("routine_runs") && ++runWrites === failingWrite)
        throw new Error("store unavailable");
      return write(key, text);
    });
  const res = await postFire({
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  });
  spy.mockRestore();

  expect(res.status).toBe(503);
  expect(await bus.get(`routine:fired:r1:${FIRE_AT}`)).toBeNull();
  expect(await runs()).toHaveLength(recorded);
});

test.each([
  ["unknown", [routine()], "missing"],
  ["disabled", [routine({ enabled: false })], "r1"],
  [
    "trigger-only",
    [
      routine({
        schedule: undefined,
        trigger: {
          toolkit: "gmail",
          trigger_slug: "GMAIL_NEW",
          trigger_config: {},
        },
      }),
    ],
    "r1",
  ],
])("%s routine returns no_routine", async (_name, routines, routineId) => {
  await seedRoutines(routines as Routine[]);
  const res = await postFire({
    routineId,
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  });
  expect(await res.json()).toEqual({ result: "no_routine" });
  expect(channel.fired).toHaveLength(0);
});

test("a mismatched acting subject is a stable permanent refusal", async () => {
  await seedRoutines([routine()]);
  const res = await postFire({
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("someone-else"),
  });

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: "acting-as subject does not match routine creator",
    code: "routine_creator_mismatch",
  });
  expect(await bus.get(`routine:fired:r1:${FIRE_AT}`)).toBeNull();
});

test("an AI Manager pod fires its routines as its own person", async () => {
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "member");
  try {
    await seedRoutines([routine()]);
    const res = await postFire({
      routineId: "r1",
      fireAt: FIRE_AT,
      actingAs: actingAs("member"),
    });
    expect(await res.json()).toMatchObject({ result: "fired" });
    expect(channel.fired).toHaveLength(1);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("a creator-less legacy routine has no owner fallback", async () => {
  await seedRoutines([routine({ created_by: undefined })]);
  const res = await postFire({
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: "malformed",
  });

  expect(res.status).toBe(400);
  expect((await res.json()) as unknown).toMatchObject({
    code: "routine_creator_mismatch",
  });
  expect(await bus.get(`routine:fired:r1:${FIRE_AT}`)).toBeNull();
  expect(channel.fired).toHaveLength(0);
});

test("a duplicate instant is idempotently fired and deduped", async () => {
  await seedRoutines([routine()]);
  const body = {
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  };
  expect(await (await postFire(body)).json()).toEqual({ result: "fired" });
  const replay = (await (await postFire(body)).json()) as {
    startedAt: string;
  };
  expect(replay).toEqual({
    result: "fired",
    deduped: true,
    startedAt: expect.any(String),
  });
  expect(Number.isNaN(Date.parse(replay.startedAt))).toBe(false);
  expect(await runs()).toHaveLength(1);
  expect(channel.fired).toHaveLength(1);
});

test("gateway-proxied external clients are rejected with 404", async () => {
  await seedRoutines([routine()]);
  const res = await postFire(
    { routineId: "r1", fireAt: FIRE_AT, actingAs: actingAs("creator-1") },
    { ...auth(), "x-houston-acting-as": actingAs("alice") },
  );
  expect(res.status).toBe(404);
  expect(channel.fired).toHaveLength(0);
});

test("local scan and the pod route burn the same instant key", async () => {
  await seedRoutines([routine()]);
  const scheduler = new Scheduler({
    store,
    vfs,
    paths: new CloudPaths(),
    lock: bus,
    firer: new ChannelRoutineFirer({ gke: channel }),
    now: () => SINCE,
  });
  scheduler.start();
  await scheduler.tick(DUE);
  scheduler.stop();

  const res = await postFire({
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  });
  expect(await res.json()).toEqual({ result: "fired", deduped: true });
  expect(await runs()).toHaveLength(1);
  expect(channel.fired).toHaveLength(1);
});

test("external mode leaves trigger delivery and run-now operational", async () => {
  const scheduled = routine();
  const triggered = routine({
    id: "triggered",
    schedule: undefined,
    trigger: {
      toolkit: "gmail",
      trigger_slug: "GMAIL_NEW",
      trigger_config: {},
    },
  });
  await seedRoutines([scheduled, triggered]);
  const scheduler = new Scheduler({
    store,
    vfs,
    paths: new CloudPaths(),
    lock: bus,
    firer: new ChannelRoutineFirer({ gke: channel }),
    mode: "external",
    now: () => SINCE,
  });
  scheduler.start();
  await scheduler.tick(DUE);
  scheduler.stop();
  expect(channel.fired).toHaveLength(0);

  const triggerRes = await fetch(`${base}/agents/${agentId}/trigger-events`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      events: [
        {
          id: "event-1",
          routine_id: "triggered",
          trigger_slug: "GMAIL_NEW",
          payload: {},
        },
      ],
    }),
  });
  expect(await triggerRes.json()).toEqual({
    result: "fired",
    event_ids: ["event-1"],
  });

  const runNow = await fetch(`${base}/agents/${agentId}/routines/r1/run`, {
    method: "POST",
    headers: auth(),
  });
  expect(runNow.status).toBe(200);
  expect(channel.fired).toHaveLength(2);
  const rows = await runs();
  expect(rows.filter((r) => r.manual === true)).toHaveLength(1);
  expect(
    rows.find((r) => r.routine_id === "triggered")?.manual,
  ).toBeUndefined();
});

test("a redelivery during the first fire waits instead of settling", async () => {
  await seedRoutines([routine()]);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fire = channel.fireTurn.bind(channel);
  channel.fireTurn = async (...args) => {
    await gate;
    return fire(...args);
  };
  const body = {
    routineId: "r1",
    fireAt: FIRE_AT,
    actingAs: actingAs("creator-1"),
  };
  const first = postFire(body);
  await vi.waitFor(async () =>
    expect(await bus.get(`routine:fired:r1:${FIRE_AT}`)).not.toBeNull(),
  );

  const early = await postFire(body);
  expect(early.status).toBe(503);
  expect(early.headers.get("retry-after")).toBe("2");

  release();
  expect(await (await first).json()).toEqual({ result: "fired" });
  expect(await (await postFire(body)).json()).toMatchObject({
    result: "fired",
    deduped: true,
  });
  expect(channel.fired).toHaveLength(1);
});
