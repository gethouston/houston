import { test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createControlPlaneServer, type AdminDeps, type ControlPlaneDeps, type SandboxRouter } from "./server";
import { MemoryWorkspaceStore } from "./store/memory";
import { MemoryCredentialStore } from "./credentials/store";
import type { CredentialVault, SandboxEndpoint, SandboxManager, TokenVerifier } from "./ports";
import type { Agent } from "./domain/types";
import { FakeClusterReader } from "./admin/cluster";
import type { AutopilotRates } from "./admin/billing";

/**
 * Personal-tier access boundary at the HTTP layer:
 *  - a user sees and controls ALL their OWN agents (no permission layer),
 *  - another user is fully walled off from them (403),
 *  - the per-agent transparent proxy (chat + provider connect) works for the owner.
 *
 * (Agent↔agent isolation — "an agent can't see another agent's files" — is the
 * sandbox's job and is covered in the runtime/sandbox tests, not here.)
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

const sandboxes: SandboxManager = {
  async ensureAwake(): Promise<SandboxEndpoint> {
    return { baseUrl: "http://sandbox.local", token: "runtime-token" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};

// Records every forwarded request and answers like a sandbox runtime would:
// an SSE stream for /events, JSON otherwise.
const forwarded: { method: string; path: string; body?: string }[] = [];
const router: SandboxRouter = {
  async forward(_endpoint, request, res) {
    forwarded.push({
      method: request.method,
      path: request.path,
      body: request.body?.toString("utf8"),
    });
    if (request.path.endsWith("/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: streaming ${request.path}\n\n`);
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, echo: request.path }));
  },
};

const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
// Fake vault: a sandbox token is just "sbx:<workspaceId>", so a test can present
// one for a known workspace.
const vault: CredentialVault = {
  async realKeyFor() {
    return null;
  },
  sandboxToken(workspaceId) {
    return `sbx:${workspaceId}`;
  },
  validateSandboxToken(token) {
    return token.startsWith("sbx:") ? { workspaceId: token.slice(4), agentId: "a" } : null;
  },
};
let server: Server;
let base = "";
let aliceSalesId = "";
let aliceHrId = "";
let bobAgentId = "";
const auth = (who: string) => ({ Authorization: `Bearer tok:${who}` });

beforeAll(async () => {
  const deps: ControlPlaneDeps = { verifier, store, sandboxes, router, credentials, vault };
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  // Alice owns two agents; Bob owns one — each in their own personal workspace.
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  aliceSalesId = (await store.createAgent({ workspaceId: aliceWs.id, name: "SalesAgent" })).id;
  aliceHrId = (await store.createAgent({ workspaceId: aliceWs.id, name: "HRAgent" })).id;
  const bobWs = await store.getOrCreatePersonalWorkspace("bob");
  bobAgentId = (await store.createAgent({ workspaceId: bobWs.id, name: "BobAgent" })).id;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("GET /health is public", async () => {
  const r = await fetch(`${base}/health`);
  expect(r.status).toBe(200);
});

test("no token → 401", async () => {
  expect((await fetch(`${base}/agents`)).status).toBe(401);
});

test("a user sees ALL of their own agents", async () => {
  const r = await fetch(`${base}/agents`, { headers: auth("alice") });
  expect(r.status).toBe(200);
  const agents = (await r.json()) as Agent[];
  expect(agents.map((a) => a.name).sort()).toEqual(["HRAgent", "SalesAgent"]);
});

test("another user sees only THEIR agents, never anyone else's", async () => {
  const r = await fetch(`${base}/agents`, { headers: auth("bob") });
  const agents = (await r.json()) as Agent[];
  expect(agents.map((a) => a.name)).toEqual(["BobAgent"]);
});

test("the owner can message their agent → forwarded 1:1 to the sandbox runtime", async () => {
  const r = await fetch(`${base}/agents/${aliceSalesId}/conversations/c1/messages`, {
    method: "POST",
    headers: { ...auth("alice"), "Content-Type": "application/json" },
    body: JSON.stringify({ text: "what are this quarter's sales?" }),
  });
  expect(r.status).toBe(200);
  const last = forwarded.at(-1)!;
  expect(last.method).toBe("POST");
  expect(last.path).toBe("/conversations/c1/messages");
  expect(JSON.parse(last.body!)).toEqual({ text: "what are this quarter's sales?" });
});

test("a different user CANNOT reach someone else's agent → 403, nothing forwarded", async () => {
  const before = forwarded.length;
  const r = await fetch(`${base}/agents/${aliceSalesId}/conversations/c2/messages`, {
    method: "POST",
    headers: { ...auth("bob"), "Content-Type": "application/json" },
    body: JSON.stringify({ text: "show me Alice's sales" }),
  });
  expect(r.status).toBe(403);
  expect(forwarded.length).toBe(before);
});

test("the owner can reach their agent's provider auth status (the connect passthrough)", async () => {
  const r = await fetch(`${base}/agents/${aliceSalesId}/auth/status`, { headers: auth("alice") });
  expect(r.status).toBe(200);
  expect(forwarded.at(-1)).toMatchObject({ method: "GET", path: "/auth/status" });
});

test("a different user cannot start a provider login on someone else's agent → 403", async () => {
  const before = forwarded.length;
  const r = await fetch(`${base}/agents/${aliceSalesId}/auth/openai-codex/login`, {
    method: "POST",
    headers: { ...auth("bob"), "Content-Type": "application/json" },
    body: "{}",
  });
  expect(r.status).toBe(403);
  expect(forwarded.length).toBe(before);
});

test("the owner can create, rename, and delete their agents", async () => {
  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: { ...auth("alice"), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "MarketingAgent" }),
  });
  expect(created.status).toBe(201);
  const agent = (await created.json()) as Agent;

  const renamed = await fetch(`${base}/agents/${agent.id}`, {
    method: "PATCH",
    headers: { ...auth("alice"), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "GrowthAgent" }),
  });
  expect(renamed.status).toBe(200);
  expect(((await renamed.json()) as Agent).name).toBe("GrowthAgent");

  const deleted = await fetch(`${base}/agents/${agent.id}`, { method: "DELETE", headers: auth("alice") });
  expect(deleted.status).toBe(200);

  const list = (await (await fetch(`${base}/agents`, { headers: auth("alice") })).json()) as Agent[];
  expect(list.map((a) => a.id)).not.toContain(agent.id);
});

test("a user cannot rename someone else's agent → 403", async () => {
  const r = await fetch(`${base}/agents/${aliceHrId}`, {
    method: "PATCH",
    headers: { ...auth("bob"), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hacked" }),
  });
  expect(r.status).toBe(403);
});

test("events stream from the owner's agent", async () => {
  const r = await fetch(`${base}/agents/${bobAgentId}/conversations/c9/events`, { headers: auth("bob") });
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("data: streaming /conversations/c9/events");
});

test("connect-once: a sandbox serves its workspace's central credential by sandbox token", async () => {
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  await credentials.put({
    workspaceId: aliceWs.id,
    provider: "openai-codex",
    accessToken: "AT",
    refreshToken: "RT",
    accountId: "acct-1",
    expiresAt: Date.now() + 3_600_000,
  });
  const r = await fetch(`${base}/sandbox/credential?provider=openai-codex`, {
    headers: { Authorization: `Bearer sbx:${aliceWs.id}` },
  });
  expect(r.status).toBe(200);
  const c = (await r.json()) as { access: string; refresh: string; accountId: string };
  expect(c.access).toBe("AT");
  expect(c.accountId).toBe("acct-1");
});

// --- Operator dashboard (/admin/*) ------------------------------------------

const RATES: AutopilotRates = {
  vcpuHourUsd: 0.0445,
  memGiBHourUsd: 0.0049,
  pdGiBMonthUsd: 0.1,
  clusterHourUsd: 0.1,
};

const baseDeps = () => ({ verifier, store, sandboxes, router, credentials, vault });

async function startServer(deps: ControlPlaneDeps): Promise<{ base: string; close: () => Promise<void> }> {
  const s = createControlPlaneServer(deps);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const addr = s.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { base: b, close: () => new Promise<void>((r) => s.close(() => r())) };
}

test("the admin API does not exist (404) when no admin deps are wired", async () => {
  // The module-level server was built without `admin`.
  const r = await fetch(`${base}/admin/overview`, { headers: auth("alice") });
  expect(r.status).toBe(404);
});

test("admin overview: a non-admin is 403; an admin sees every user's pods", async () => {
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  const cluster = new FakeClusterReader({
    pods: [
      {
        workspaceId: aliceWs.id,
        agentId: aliceSalesId,
        namespace: "ws-alice",
        podName: "agent-sales",
        phase: "Running",
        ready: true,
        nodeName: "gke-node-1",
        startedAt: "2026-06-08T00:00:00.000Z",
        restarts: 0,
        cpuRequestCores: 0.25,
        memRequestBytes: 512 * 1024 * 1024,
      },
    ],
    volumes: [],
  });
  const admin: AdminDeps = { adminUserIds: ["alice"], cluster, billing: null, rates: RATES };
  const { base: abase, close } = await startServer({ ...baseDeps(), admin });
  try {
    expect((await fetch(`${abase}/admin/overview`, { headers: auth("bob") })).status).toBe(403);

    const r = await fetch(`${abase}/admin/overview`, { headers: auth("alice") });
    expect(r.status).toBe(200);
    const ov = (await r.json()) as any;
    expect(ov.totals.pods.running).toBe(1);
    const aliceUser = ov.users.find((u: any) => u.userId === "alice");
    expect(aliceUser.agents.some((a: any) => a.agentId === aliceSalesId && a.state === "running")).toBe(true);
    // Bob shows up too (cross-tenant view), with no running pods.
    expect(ov.users.some((u: any) => u.userId === "bob")).toBe(true);
  } finally {
    await close();
  }
});

test("admin billing: estimate renders, actuals report 'not-configured' without BigQuery", async () => {
  const admin: AdminDeps = { adminUserIds: ["alice"], cluster: new FakeClusterReader(), billing: null, rates: RATES };
  const { base: abase, close } = await startServer({ ...baseDeps(), admin });
  try {
    const r = await fetch(`${abase}/admin/billing`, { headers: auth("alice") });
    expect(r.status).toBe(200);
    const rep = (await r.json()) as any;
    expect(rep.actualsStatus).toBe("not-configured");
    expect(rep.actuals).toBeNull();
    expect(rep.estimate.byUser).toBeArray();
  } finally {
    await close();
  }
});

test("admin billing: ?days defaults to 30 when absent, and is honored when given", async () => {
  const seen: number[] = [];
  const recordingBilling = {
    async query(days: number) {
      seen.push(days);
      return {
        source: "bigquery" as const,
        rangeDays: days,
        startDate: "2026-05-09",
        endDate: "2026-06-08",
        currency: "USD",
        totalUsd: 0,
        byNamespace: [],
      };
    },
  };
  const admin: AdminDeps = { adminUserIds: ["alice"], cluster: new FakeClusterReader(), billing: recordingBilling, rates: RATES };
  const { base: abase, close } = await startServer({ ...baseDeps(), admin });
  try {
    await fetch(`${abase}/admin/billing`, { headers: auth("alice") }); // no ?days
    await fetch(`${abase}/admin/billing?days=7`, { headers: auth("alice") });
    expect(seen).toEqual([30, 7]);
  } finally {
    await close();
  }
});

test("admin routes reject non-GET with 405", async () => {
  const admin: AdminDeps = { adminUserIds: ["alice"], cluster: new FakeClusterReader(), billing: null, rates: RATES };
  const { base: abase, close } = await startServer({ ...baseDeps(), admin });
  try {
    const r = await fetch(`${abase}/admin/overview`, { method: "POST", headers: auth("alice") });
    expect(r.status).toBe(405);
  } finally {
    await close();
  }
});

test("the credential endpoint rejects a bad sandbox token (401) and an unconnected workspace (404)", async () => {
  expect(
    (await fetch(`${base}/sandbox/credential`, { headers: { Authorization: "Bearer nope" } })).status,
  ).toBe(401);
  const bobWs = await store.getOrCreatePersonalWorkspace("bob");
  expect(
    (await fetch(`${base}/sandbox/credential`, { headers: { Authorization: `Bearer sbx:${bobWs.id}` } })).status,
  ).toBe(404);
});
