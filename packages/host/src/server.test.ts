import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { SingleUserVerifier } from "./auth/verify";
import { ProxyChannel, type RuntimeProxy } from "./channel/proxy";
import { MemoryCredentialStore } from "./credentials/store";
import type { Agent } from "./domain/types";
import type {
  CredentialVault,
  RuntimeEndpoint,
  RuntimeLauncher,
  TokenVerifier,
} from "./ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "./server";
import { MemoryWorkspaceStore } from "./store/memory";
import { startTestFetchServer } from "./testing/fetch-server";

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

const sandboxes: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
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
const router: RuntimeProxy = {
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
  sandboxToken(workspaceId) {
    return `sbx:${workspaceId}`;
  },
  validateSandboxToken(token) {
    return token.startsWith("sbx:")
      ? { workspaceId: token.slice(4), agentId: "a" }
      : null;
  },
};
let server: Server;
let base = "";
let aliceSalesId = "";
let aliceHrId = "";
let bobAgentId = "";
const auth = (who: string) => ({ Authorization: `Bearer tok:${who}` });

// Standing-runtime channel over a given launcher — the gke wiring main.ts builds.
const channelsWith = (launcher: RuntimeLauncher) => ({
  gke: new ProxyChannel({
    launcher,
    proxy: router,
    credentials,
    forwardActingHeader: false,
  }),
});

const TEST_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
};

beforeAll(async () => {
  const deps: ControlPlaneDeps = baseDeps();
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  // Alice owns two agents; Bob owns one — each in their own personal workspace.
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  aliceSalesId = (
    await store.createAgent({ workspaceId: aliceWs.id, name: "SalesAgent" })
  ).id;
  aliceHrId = (
    await store.createAgent({ workspaceId: aliceWs.id, name: "HRAgent" })
  ).id;
  const bobWs = await store.getOrCreatePersonalWorkspace("bob");
  bobAgentId = (
    await store.createAgent({ workspaceId: bobWs.id, name: "BobAgent" })
  ).id;
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
  const r = await fetch(
    `${base}/agents/${aliceSalesId}/conversations/c1/messages`,
    {
      method: "POST",
      headers: { ...auth("alice"), "Content-Type": "application/json" },
      body: JSON.stringify({ text: "what are this quarter's sales?" }),
    },
  );
  expect(r.status).toBe(200);
  const last = forwarded.at(-1);
  if (!last) throw new Error("expected at least one forwarded request");
  expect(last.method).toBe("POST");
  expect(last.path).toBe("/conversations/c1/messages");
  if (last.body === undefined)
    throw new Error("expected a forwarded request body");
  expect(JSON.parse(last.body)).toEqual({
    text: "what are this quarter's sales?",
  });
});

test("a different user CANNOT reach someone else's agent → 403, nothing forwarded", async () => {
  const before = forwarded.length;
  const r = await fetch(
    `${base}/agents/${aliceSalesId}/conversations/c2/messages`,
    {
      method: "POST",
      headers: { ...auth("bob"), "Content-Type": "application/json" },
      body: JSON.stringify({ text: "show me Alice's sales" }),
    },
  );
  expect(r.status).toBe(403);
  expect(forwarded.length).toBe(before);
});

test("the owner can reach their agent's provider auth status (the connect passthrough)", async () => {
  const r = await fetch(`${base}/agents/${aliceSalesId}/auth/status`, {
    headers: auth("alice"),
  });
  expect(r.status).toBe(200);
  expect(forwarded.at(-1)).toMatchObject({
    method: "GET",
    path: "/auth/status",
  });
});

test("a different user cannot start a provider login on someone else's agent → 403", async () => {
  const before = forwarded.length;
  const r = await fetch(
    `${base}/agents/${aliceSalesId}/auth/openai-codex/login`,
    {
      method: "POST",
      headers: { ...auth("bob"), "Content-Type": "application/json" },
      body: "{}",
    },
  );
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

  const deleted = await fetch(`${base}/agents/${agent.id}`, {
    method: "DELETE",
    headers: auth("alice"),
  });
  expect(deleted.status).toBe(200);

  const list = (await (
    await fetch(`${base}/agents`, { headers: auth("alice") })
  ).json()) as Agent[];
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
  const r = await fetch(
    `${base}/agents/${bobAgentId}/conversations/c9/events`,
    { headers: auth("bob") },
  );
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
  const c = (await r.json()) as Record<string, unknown>;
  expect(c.access).toBe("AT");
  expect(c.accountId).toBe("acct-1");
  // Gate #2: the refresh token NEVER leaves the control plane.
  expect("refresh" in c).toBe(false);
  expect(JSON.stringify(c)).not.toContain("RT");
});

test("capture stores the credential centrally, then scrubs the sandbox's refresh token", async () => {
  // A real fake runtime: serves /auth/export like a freshly-connected pod and
  // records the scrub call that must follow.
  let scrubCalls = 0;
  const fakeRuntime = await startTestFetchServer((req) => {
    const u = new URL(req.url);
    if (u.pathname === "/auth/export") {
      return Response.json({
        provider: "openai-codex",
        access: "AT-cap",
        refresh: "RT-cap",
        expires: 1750000000000,
        accountId: "acct-cap",
      });
    }
    if (u.pathname === "/auth/scrub-refresh" && req.method === "POST") {
      scrubCalls++;
      return Response.json({ ok: true, scrubbed: ["openai-codex"] });
    }
    return new Response("not found", { status: 404 });
  });
  const deps: ControlPlaneDeps = {
    ...baseDeps(),
    channels: channelsWith({
      ...sandboxes,
      async ensureAwake(): Promise<RuntimeEndpoint> {
        return {
          baseUrl: fakeRuntime.baseUrl,
          token: "runtime-token",
        };
      },
    }),
  };
  const { base: b, close } = await startServer(deps);
  try {
    const r = await fetch(`${b}/agents/${aliceSalesId}/credential/capture`, {
      method: "POST",
      headers: auth("alice"),
    });
    expect(r.status).toBe(200);
    expect(scrubCalls).toBe(1);
    const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
    const stored = await credentials.get(aliceWs.id, "openai-codex");
    expect(stored?.refreshToken).toBe("RT-cap"); // central store holds it…
    expect(stored?.accessToken).toBe("AT-cap");
  } finally {
    await close();
    await fakeRuntime.stop();
  }
});

test("a failed scrub surfaces as an error (credential still stored)", async () => {
  const fakeRuntime = await startTestFetchServer((req) => {
    const u = new URL(req.url);
    if (u.pathname === "/auth/export") {
      return Response.json({
        provider: "openai-codex",
        access: "AT2",
        refresh: "RT2",
        expires: 1750000000000,
      });
    }
    return new Response("scrub exploded", { status: 500 });
  });
  const deps: ControlPlaneDeps = {
    ...baseDeps(),
    channels: channelsWith({
      ...sandboxes,
      async ensureAwake(): Promise<RuntimeEndpoint> {
        return {
          baseUrl: fakeRuntime.baseUrl,
          token: "runtime-token",
        };
      },
    }),
  };
  const { base: b, close } = await startServer(deps);
  try {
    const r = await fetch(`${b}/agents/${aliceSalesId}/credential/capture`, {
      method: "POST",
      headers: auth("alice"),
    });
    expect(r.status).toBe(502); // never silent: the user sees the real reason
    const body = (await r.json()) as { error: string };
    expect(body.error).toContain("refresh token");
  } finally {
    await close();
    await fakeRuntime.stop();
  }
});

test("logout forgets the workspace credential so no turn can re-serve it", async () => {
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  await credentials.put({
    workspaceId: aliceWs.id,
    provider: "openai-codex",
    accessToken: "AT-forget",
    refreshToken: "RT-forget",
    expiresAt: 1750000000000,
  });
  expect(await credentials.get(aliceWs.id, "openai-codex")).not.toBeNull();

  const r = await fetch(`${base}/agents/${aliceSalesId}/credential/forget`, {
    method: "POST",
    headers: { ...auth("alice"), "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "openai-codex" }),
  });
  expect(r.status).toBe(200);
  // The connect-once store is now empty for that provider, so /sandbox/credential
  // 404s and the runtime can't re-hydrate — logout actually sticks.
  expect(await credentials.get(aliceWs.id, "openai-codex")).toBeNull();
});

test("a different user CANNOT forget someone else's credential → 403", async () => {
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  await credentials.put({
    workspaceId: aliceWs.id,
    provider: "openai-codex",
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: 1750000000000,
  });
  const r = await fetch(`${base}/agents/${aliceSalesId}/credential/forget`, {
    method: "POST",
    headers: { ...auth("bob"), "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "openai-codex" }),
  });
  expect(r.status).toBe(403);
  expect(await credentials.get(aliceWs.id, "openai-codex")).not.toBeNull(); // untouched
});

// The operator dashboard (`/admin/*`) is the CLOSED admin surface, injected via
// the `mountAdmin` seam. Its end-to-end tests (404 when unmounted, the
// non-admin/admin 403/200 split, billing days, the 405s) live in
// `@houston/host-cloud` (routes/admin.test.ts), which wires `handleAdmin` into
// this same server through `mountAdmin`. The open server only proves the seam is
// absent by default — see the "unmounted → 404" case below.

const baseDeps = () => ({
  verifier,
  store,
  credentials,
  vault,
  channels: channelsWith(sandboxes),
  capabilities: TEST_CAPABILITIES,
});

async function startServer(
  deps: ControlPlaneDeps,
): Promise<{ base: string; close: () => Promise<void> }> {
  const s = createControlPlaneServer(deps);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const addr = s.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { base: b, close: () => new Promise<void>((r) => s.close(() => r())) };
}

test("/admin/* 404s when no admin surface is injected (the local-profile default)", async () => {
  // The module-level server was built without `mountAdmin` — exactly the local
  // profile. The full admin behavior (403/200, billing, 405s) is exercised in
  // @houston/host-cloud's routes/admin.test.ts, which injects `handleAdmin`.
  const r = await fetch(`${base}/admin/overview`, { headers: auth("alice") });
  expect(r.status).toBe(404);
});

// --- v3 meta surface + the local-profile identity adapter ---------------------

test("/v1/version and /v1/capabilities are public and serve the v3 contract", async () => {
  const v = await fetch(`${base}/v1/version`);
  expect(v.status).toBe(200);
  expect((await v.json()) as object).toMatchObject({
    engine: "houston-host",
    protocol: 3,
  });

  const c = await fetch(`${base}/v1/capabilities`);
  expect(c.status).toBe(200);
  const caps = (await c.json()) as Capabilities;
  expect(caps.profile).toBe("cloud");
  expect(caps.codeExecution).toBe("remote-sandbox");
  expect(caps.providers).toEqual(["openai-codex"]);
});

test("SingleUserVerifier: the boot token resolves to the owner; anything else is 401", async () => {
  const { base: b, close } = await startServer({
    ...baseDeps(),
    verifier: new SingleUserVerifier({ token: "boot-secret" }),
  });
  try {
    // The owner's token reaches the same authorize() seam as cloud users.
    const ok = await fetch(`${b}/agents`, {
      headers: { Authorization: "Bearer boot-secret" },
    });
    expect(ok.status).toBe(200);

    // A wrong/missing token is rejected — loopback neighbors can't drive the agents.
    expect(
      (
        await fetch(`${b}/agents`, {
          headers: { Authorization: "Bearer guess" },
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${b}/agents`)).status).toBe(401);
  } finally {
    await close();
  }
});

test("a workspace whose hosting model has no channel wired answers 503", async () => {
  const { base: b, close } = await startServer({ ...baseDeps(), channels: {} });
  try {
    const r = await fetch(`${b}/agents/${aliceSalesId}/auth/status`, {
      headers: auth("alice"),
    });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toContain(
      "not configured",
    );
  } finally {
    await close();
  }
});

test("the credential endpoint rejects a bad sandbox token (401) and an unconnected workspace (404)", async () => {
  expect(
    (
      await fetch(`${base}/sandbox/credential`, {
        headers: { Authorization: "Bearer nope" },
      })
    ).status,
  ).toBe(401);
  const bobWs = await store.getOrCreatePersonalWorkspace("bob");
  expect(
    (
      await fetch(`${base}/sandbox/credential`, {
        headers: { Authorization: `Bearer sbx:${bobWs.id}` },
      })
    ).status,
  ).toBe(404);
});
