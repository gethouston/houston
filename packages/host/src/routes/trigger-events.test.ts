import type { Server } from "node:http";
import { loadRoutineRuns, saveRoutines } from "@houston/domain";
import type { Capabilities, Routine } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { ChannelCtx, RuntimeChannel, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";

/**
 * POST /agents/:id/trigger-events (C9 pod route). Asserts the discriminated
 * result (fired / no_routine / busy), that a fired run carries the event-framed
 * prompt, that a redelivery is deduped (acked, no second run), that a busy
 * routine releases the just-set lock so a retry can fire, and the auth wall.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

class SpyChannel implements RuntimeChannel {
  fired: { conversationId: string; text: string }[] = [];
  async dispatch() {}
  async fireTurn(_ctx: ChannelCtx, conversationId: string, text: string) {
    this.fired.push({ conversationId, text });
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

async function post(events: unknown, who = "alice") {
  return fetch(`${base}/agents/${agentId}/trigger-events`, {
    method: "POST",
    headers: auth(who),
    body: JSON.stringify({ events }),
  });
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
  expect(text).toContain("hi"); // the payload rode along, framed as untrusted data

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
  // The first run is still "running" (SpyChannel never completes it). A redelivery
  // of the SAME id must ack without firing again — even though the routine is busy.
  const res = await post(ev);
  expect(await res.json()).toEqual({ result: "fired", event_ids: ["e1"] });
  expect(channel.fired).toHaveLength(1);
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
  // The lock for the busy event was released so a later retry can fire it.
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
  // Trust boundary (C9): the control plane delivers over the bare host token,
  // never through the user-facing gateway proxy — which stamps
  // `x-houston-acting-as` on everything it forwards. That header on this route
  // means a user request reached a pod-internal path; firing would run the
  // routine as its creator with a caller-supplied, attacker-authored payload.
  // The pod must refuse it even though the bearer principal owns the agent.
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
