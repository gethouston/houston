import type { Server } from "node:http";
import { loadRoutineRuns } from "@houston/domain";
import type { Capabilities, Routine, RoutineRun } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { ChannelCtx, RuntimeChannel, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";

/**
 * POST /agents/:id/routines/:rid/runs/:runId/cancel — stop an in-flight run.
 * Asserts the Rust cancel_run contract: the row goes terminal FIRST ("Stopped
 * by user"), the live turn is aborted through the channel, a repeat answers
 * 409, an unknown run 404s, and the route is ownership-walled.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

class SpyChannel implements RuntimeChannel {
  cancelled: string[] = [];
  cancelThrows = false;
  async dispatch() {}
  async fireTurn(): Promise<void> {}
  async cancelTurn(_ctx: ChannelCtx, conversationId: string) {
    if (this.cancelThrows) throw new Error("runtime unreachable");
    this.cancelled.push(conversationId);
    return true;
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

/** Create a routine, fire it, and return { routine, runId } (run is `running`). */
async function startRun(): Promise<{ routine: Routine; runId: string }> {
  const created = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Daily report",
      prompt: "write the report",
      schedule: "0 9 * * *",
    }),
  });
  const routine = (await created.json()) as Routine;
  const fired = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/run`,
    { method: "POST", headers: auth("alice") },
  );
  const { runId } = (await fired.json()) as { runId: string };
  return { routine, runId };
}

async function runRows(): Promise<RoutineRun[]> {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("expected at least one agent to exist");
  return (await loadRoutineRuns(vfs, workspaceRoot(ws, agent))).items;
}

test("cancel flips the run terminal and aborts the live turn through the channel", async () => {
  const { routine, runId } = await startRun();
  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/runs/${runId}/cancel`,
    { method: "POST", headers: auth("alice") },
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as RoutineRun & { abort_failed?: boolean };
  expect(body.status).toBe("cancelled");
  expect(body.summary).toBe("Stopped by user");
  expect(body.abort_failed).toBeUndefined(); // clean abort → no failure flag

  const rows = await runRows();
  expect(rows[0]).toMatchObject({
    id: runId,
    status: "cancelled",
    summary: "Stopped by user",
  });
  expect((rows[0] as RoutineRun).completed_at).toBeTruthy();
  // The turn abort reached the runtime, on the run's own conversation.
  expect(channel.cancelled).toEqual([`routine-${routine.id}`]);
});

test("a repeat cancel answers 409 — the row is already terminal", async () => {
  const { routine, runId } = await startRun();
  await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/runs/${runId}/cancel`,
    { method: "POST", headers: auth("alice") },
  );
  const again = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/runs/${runId}/cancel`,
    { method: "POST", headers: auth("alice") },
  );
  expect(again.status).toBe(409);
});

test("an unknown run 404s", async () => {
  const { routine } = await startRun();
  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/runs/nope/cancel`,
    { method: "POST", headers: auth("alice") },
  );
  expect(res.status).toBe(404);
});

test("a turn-abort failure still leaves the run cancelled AND surfaces abort_failed", async () => {
  const { routine, runId } = await startRun();
  channel.cancelThrows = true;
  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/runs/${runId}/cancel`,
    { method: "POST", headers: auth("alice") },
  );
  expect(res.status).toBe(200);
  // The abort failure is reported, not swallowed: the runtime may still be
  // burning the turn, and the client gets to say so.
  const body = (await res.json()) as RoutineRun & { abort_failed?: boolean };
  expect(body.abort_failed).toBe(true);
  const rows = await runRows();
  expect((rows[0] as RoutineRun).status).toBe("cancelled");
});

test("another user cannot cancel the agent's run (403)", async () => {
  const { routine, runId } = await startRun();
  const res = await fetch(
    `${base}/agents/${agentId}/routines/${routine.id}/runs/${runId}/cancel`,
    { method: "POST", headers: auth("bob") },
  );
  expect(res.status).toBe(403);
  expect((await runRows())[0]?.status).toBe("running");
});
