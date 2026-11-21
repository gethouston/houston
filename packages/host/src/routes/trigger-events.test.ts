import type { Server } from "node:http";
import { loadRoutineRuns, saveRoutines } from "@houston/domain";
import type { Capabilities, Routine } from "@houston/protocol";
import { beforeEach, expect, test, vi } from "vitest";
import { TurnFireError } from "../channel/fire-error";
import { MemoryCredentialStore } from "../credentials/store";
import type { FireTurnOptions } from "../fire-turn-options";
import type { ChannelCtx, RuntimeChannel, TokenVerifier } from "../ports";
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
    actingUser?: string;
    actingAs?: string;
  }[] = [];
  refusal: Error | null = null;
  attempts = 0;
  async dispatch() {}
  async fireTurn(
    _ctx: ChannelCtx,
    conversationId: string,
    text: string,
    _pin?: unknown,
    { actingUser, actingAs }: FireTurnOptions = {},
  ) {
    this.attempts++;
    if (this.refusal) throw this.refusal;
    this.fired.push({ conversationId, text, actingUser, actingAs });
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

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: "r1",
  name: "Inbox watcher",
  prompt: "check the inbox",
  trigger: {
    toolkit: "gmail",
    trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
    trigger_config: {},
  },
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "",
  updated_at: "",
  ...over,
});

let server: Server;
let base = "";
let agentId = "";
let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let channel: SpyChannel;
let bus: MemoryTurnBus;

const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

async function seedRoutine(r: Routine): Promise<void> {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("no agent");
  await saveRoutines(vfs, workspaceRoot(ws, agent), [r]);
}

async function post(events: unknown, who = "alice", extra: object = {}) {
  return fetch(`${base}/agents/${agentId}/trigger-events`, {
    method: "POST",
    headers: auth(who),
    body: JSON.stringify({ events, ...extra }),
  });
}

function actingAs(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `acting-v1.${payload}.signature`;
}

const EVENT = { id: "e1", routine_id: "r1", trigger_slug: "HOOK", payload: {} };

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
  };
  if (server) await new Promise<void>((r) => server.close(() => r()));
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Helper" }),
  });
  agentId = ((await created.json()) as { id: string }).id;
});

test("fires one run for the batch with the event-framed prompt", async () => {
  await seedRoutine(routine());
  const res = await post([
    {
      id: "e1",
      routine_id: "r1",
      trigger_slug: "GMAIL_NEW",
      payload: { subject: "hi" },
    },
  ]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "fired", event_ids: ["e1"] });
  expect(channel.fired).toHaveLength(1);
  const text = channel.fired[0]?.text ?? "";
  expect(text).toContain("check the inbox");
  expect(text).toContain("<events>");
  expect(text).toContain("hi");

  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("no agent");
  const { items } = await loadRoutineRuns(vfs, workspaceRoot(ws, agent));
  expect(items).toHaveLength(1);
});

test("no enabled routine matches → no_routine, nothing fires", async () => {
  await seedRoutine(routine({ enabled: false }));
  const res = await post([
    { id: "e1", routine_id: "r1", trigger_slug: "GMAIL_NEW", payload: {} },
  ]);
  expect(await res.json()).toEqual({ result: "no_routine" });
  expect(channel.fired).toHaveLength(0);
});

test("an unknown routine_id → no_routine", async () => {
  await seedRoutine(routine());
  const res = await post([
    { id: "e1", routine_id: "nope", trigger_slug: "X", payload: {} },
  ]);
  expect(await res.json()).toEqual({ result: "no_routine" });
  expect(channel.fired).toHaveLength(0);
});

test("a redelivery of the same event is deduped: acked, no second run", async () => {
  await seedRoutine(routine());
  const ev = [
    { id: "e1", routine_id: "r1", trigger_slug: "GMAIL_NEW", payload: {} },
  ];
  await post(ev);
  const res = await post(ev);
  expect(await res.json()).toEqual({ result: "fired", event_ids: ["e1"] });
  expect(channel.fired).toHaveLength(1);
});

test("a fire refused for no provider consumes its event: a redelivery adds no second errored run", async () => {
  await seedRoutine(routine());
  channel.refusal = new TurnFireError(
    'runtime 409: {"code":"no_provider"}',
    409,
    "no_provider",
  );
  const ev = [
    { id: "e1", routine_id: "r1", trigger_slug: "GMAIL_NEW", payload: {} },
  ];
  for (let i = 0; i < 3; i++) {
    const res = await post(ev);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "fired", event_ids: ["e1"] });
  }
  expect(channel.attempts).toBe(1);
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("no agent");
  const { items } = await loadRoutineRuns(vfs, workspaceRoot(ws, agent));
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    status: "error",
    failure: { code: "no_model" },
  });
});

test("a busy routine (new event, run in flight) → busy AND releases the lock", async () => {
  await seedRoutine(routine());
  await post([
    { id: "e1", routine_id: "r1", trigger_slug: "GMAIL_NEW", payload: {} },
  ]);
  const res = await post([
    { id: "e2", routine_id: "r1", trigger_slug: "GMAIL_NEW", payload: {} },
  ]);
  expect(await res.json()).toEqual({ result: "busy" });
  expect(channel.fired).toHaveLength(1);
  expect(await bus.get("trigger-event:e2")).toBeNull();
});

test("another user cannot deliver to the agent (403)", async () => {
  await seedRoutine(routine());
  const res = await post(
    [{ id: "e1", routine_id: "r1", trigger_slug: "X", payload: {} }],
    "mallory",
  );
  expect(res.status).toBe(403);
  expect(channel.fired).toHaveLength(0);
});

test("a malformed events array is a 400", async () => {
  await seedRoutine(routine());
  const res = await post([{ routine_id: "r1" }]);
  expect(res.status).toBe(400);
});

test("a gateway-proxied (acting-as) request is refused: 404, nothing fires", async () => {
  await seedRoutine(routine());
  const payload = Buffer.from(JSON.stringify({ sub: "alice" })).toString(
    "base64url",
  );
  const res = await fetch(`${base}/agents/${agentId}/trigger-events`, {
    method: "POST",
    headers: {
      ...auth("alice"),
      "x-houston-acting-as": `acting-v1.${payload}.sig`,
    },
    body: JSON.stringify({
      events: [
        { id: "e1", routine_id: "r1", trigger_slug: "GMAIL_NEW", payload: {} },
      ],
    }),
  });
  expect(res.status).toBe(404);
  expect(channel.fired).toHaveLength(0);
});

test("the creator's minted acting-as token rides the turn (PRODUCT-1774)", async () => {
  await seedRoutine(routine({ created_by: "creator-1" }));
  const token = actingAs("creator-1");
  const res = await post([EVENT], "alice", { actingAs: token });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: "fired", event_ids: ["e1"] });
  expect(channel.fired).toEqual([
    expect.objectContaining({ actingAs: token, actingUser: undefined }),
  ]);
});

test("without a token the bare creator sub rides, as before", async () => {
  await seedRoutine(routine({ created_by: "creator-1" }));
  await post([EVENT]);
  expect(channel.fired).toEqual([
    expect.objectContaining({ actingUser: "creator-1", actingAs: undefined }),
  ]);
});

test("a token for someone other than the creator is refused: 400, nothing fires, no lock burned", async () => {
  await seedRoutine(routine({ created_by: "creator-1" }));
  const res = await post([EVENT], "alice", {
    actingAs: actingAs("someone-else"),
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: "acting-as subject does not match the creator of routine r1",
    code: "routine_creator_mismatch",
  });
  expect(channel.fired).toHaveLength(0);
  expect(await bus.get("trigger-event:e1")).toBeNull();
});

test("a token on a routine with no recorded creator is refused the same way", async () => {
  await seedRoutine(routine());
  const res = await post([EVENT], "alice", { actingAs: actingAs("creator-1") });
  expect(res.status).toBe(400);
  expect(channel.fired).toHaveLength(0);
});

test("on an AI Manager pod its own person fires a routine stamped with anyone, and nobody else does", async () => {
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "member");
  try {
    await seedRoutine(routine({ created_by: "org-owner" }));
    const refused = await post([EVENT], "alice", {
      actingAs: actingAs("someone-else"),
    });
    expect(refused.status).toBe(400);
    expect(channel.fired).toHaveLength(0);
    const token = actingAs("member");
    const res = await post([EVENT], "alice", { actingAs: token });
    expect(res.status).toBe(200);
    expect(channel.fired).toEqual([
      expect.objectContaining({ actingAs: token }),
    ]);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("a non-string actingAs is a 400", async () => {
  await seedRoutine(routine({ created_by: "creator-1" }));
  const res = await post([EVENT], "alice", { actingAs: 42 });
  expect(res.status).toBe(400);
  expect(channel.fired).toHaveLength(0);
});
