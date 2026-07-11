import type { Server } from "node:http";
import { loadRoutineRuns } from "@houston/domain";
import type { Capabilities, Routine, RoutineRun } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type {
  ChannelCtx,
  RuntimeChannel,
  TokenVerifier,
  TurnPin,
} from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";

/**
 * POST /agents/:id/routines/:rid/run — fire a routine ON DEMAND through the same
 * firer + record path the scheduler uses. Asserts: a routine_run is recorded,
 * the channel's fireTurn is called with the routine's prompt + conversation, a
 * fire failure marks the run errored AND answers 502 (never a silent miss), and
 * the route is ownership-walled + 404s an unknown routine.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

/** A channel that records every fireTurn; optionally throws to exercise the error path. */
class SpyChannel implements RuntimeChannel {
  fired: { conversationId: string; text: string; pin?: TurnPin }[] = [];
  throwMessage: string | null = null;
  async dispatch() {}
  async fireTurn(
    _ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
  ): Promise<void> {
    this.fired.push({ conversationId, text, pin });
    if (this.throwMessage) throw new Error(this.throwMessage);
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

let server: Server;
let base = "";
let agentId = "";
let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let channel: SpyChannel;

const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

async function makeRoutine(
  over: Partial<{ prompt: string; suppress_when_silent: boolean }> = {},
): Promise<Routine> {
  const created = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Daily report",
      prompt: over.prompt ?? "write the report",
      schedule: "0 9 * * *",
      suppress_when_silent: over.suppress_when_silent ?? false,
    }),
  });
  return (await created.json()) as Routine;
}

beforeEach(async () => {
  store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  channel = new SpyChannel();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: { gke: channel },
    vfs,
    capabilities: CAPS,
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

test("fires the routine now: records a running run and calls fireTurn with the prompt", async () => {
  const routine = await makeRoutine({ prompt: "send the weekly digest" });

  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/run`,
    {
      method: "POST",
      headers: auth("alice"),
    },
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; runId: string };
  expect(body.ok).toBe(true);

  // The firer reached the channel with the routine's prompt + its shared conversation.
  expect(channel.fired).toHaveLength(1);
  const fired0 = channel.fired[0];
  if (!fired0) throw new Error("expected channel.fired[0] to exist");
  expect(fired0.text).toBe("send the weekly digest");
  expect(fired0.conversationId).toBe(`routine-${routine.id}`);
  expect(fired0.pin?.mode).toBe("auto");

  // A run was recorded (the same record a scheduled fire writes).
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agents = await store.listAgents(ws.id);
  const agent = agents[0];
  if (!agent) throw new Error("expected at least one agent to exist");
  const { items } = await loadRoutineRuns(vfs, workspaceRoot(ws, agent));
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    routine_id: routine.id,
    id: body.runId,
    status: "running",
  });
});

test("the suppression instruction rides on the prompt when opted in", async () => {
  const routine = await makeRoutine({
    prompt: "check the inbox",
    suppress_when_silent: true,
  });
  await fetch(`${base}/agents/${agentId}/routines/${routine.id}/run`, {
    method: "POST",
    headers: auth("alice"),
  });
  const firedSuppressed = channel.fired[0];
  if (!firedSuppressed) throw new Error("expected channel.fired[0] to exist");
  expect(firedSuppressed.text).toContain("check the inbox");
  expect(firedSuppressed.text).toContain("ROUTINE_OK");
});

test("a fire failure answers 502 and marks the run errored — never stuck running, never silent", async () => {
  const routine = await makeRoutine();
  channel.throwMessage = "runtime unreachable";

  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/run`,
    {
      method: "POST",
      headers: auth("alice"),
    },
  );
  expect(res.status).toBe(502);
  expect(((await res.json()) as { error: string }).error).toContain(
    "runtime unreachable",
  );

  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agentsErr = await store.listAgents(ws.id);
  const agent = agentsErr[0];
  if (!agent) throw new Error("expected at least one agent to exist");
  const { items } = await loadRoutineRuns(vfs, workspaceRoot(ws, agent));
  expect(items).toHaveLength(1);
  const run = items[0] as RoutineRun;
  expect(run.status).toBe("error");
  expect(run.summary).toContain("runtime unreachable");
  expect(run.completed_at).toBeTruthy();
});

test("a second run while one is in flight answers 409 and fires nothing (in-flight gate)", async () => {
  const routine = await makeRoutine();
  const first = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/run`,
    { method: "POST", headers: auth("alice") },
  );
  expect(first.status).toBe(200);

  // The first run is still `running` (nothing reconciled it) — parity with the
  // Rust create_if_routine_idle Conflict.
  const second = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/run`,
    { method: "POST", headers: auth("alice") },
  );
  expect(second.status).toBe(409);
  expect(((await second.json()) as { error: string }).error).toContain(
    "already running",
  );
  expect(channel.fired).toHaveLength(1);

  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("expected at least one agent to exist");
  const { items } = await loadRoutineRuns(vfs, workspaceRoot(ws, agent));
  expect(items).toHaveLength(1); // no second run row
});

test("an unknown routine 404s, never fires", async () => {
  const res = await fetch(
    `${base}/agents/${agentId}/routines/does-not-exist/run`,
    {
      method: "POST",
      headers: auth("alice"),
    },
  );
  expect(res.status).toBe(404);
  expect(channel.fired).toHaveLength(0);
});

test("another user cannot run the agent's routine (403)", async () => {
  const routine = await makeRoutine();
  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/run`,
    {
      method: "POST",
      headers: auth("bob"),
    },
  );
  expect(res.status).toBe(403);
  expect(channel.fired).toHaveLength(0);
});

test("two simultaneous run-now requests: one fires, one 409s, exactly one run row", async () => {
  const routine = await makeRoutine();
  // Both requests race the in-flight gate; the per-agent runs-file queue must
  // let exactly one through — never two turns into the same conversation, and
  // never a run row silently dropped by the second whole-file save.
  const [a, b] = await Promise.all([
    fetch(`${base}/agents/${agentId}/routines/${routine.id}/run`, {
      method: "POST",
      headers: auth("alice"),
    }),
    fetch(`${base}/agents/${agentId}/routines/${routine.id}/run`, {
      method: "POST",
      headers: auth("alice"),
    }),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  expect(channel.fired).toHaveLength(1);

  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("expected at least one agent to exist");
  const { items } = await loadRoutineRuns(vfs, workspaceRoot(ws, agent));
  expect(items).toHaveLength(1);
});
