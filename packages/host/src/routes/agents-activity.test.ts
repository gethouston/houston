import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { createRoutineRun, saveRoutineRuns } from "@houston/domain";
import type { Capabilities, Routine, RoutineRun } from "@houston/protocol";
import { beforeEach, expect, test, vi } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
import { MemoryCredentialStore } from "../credentials/store";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  TurnPin,
} from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { workspaceRoot } from "./agent-data";
import { podActivityStatus } from "./agents-activity";
import { dispatchGroup } from "./registry/all";

class SpyChannel implements RuntimeChannel {
  busyResult = false;
  loginPendingResult = false;
  runtime = "running" as const;
  dispatched: string[] = [];
  fired: { conversationId: string; text: string; pin?: TurnPin }[] = [];

  async dispatch(
    _ctx: ChannelCtx,
    _method: string,
    rest: string,
    _url: URL,
    _req: IncomingMessage,
    res: ServerResponse,
  ) {
    this.dispatched.push(rest);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unexpected dispatch" }));
  }
  async fireTurn(
    _ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
  ) {
    this.fired.push({ conversationId, text, pin });
  }
  async cancelTurn() {
    return false;
  }
  async busy() {
    return this.busyResult;
  }
  async loginPending() {
    return this.loginPendingResult;
  }
  async runtimeStatus() {
    return this.runtime;
  }
  async teardown() {}
  async captureCredential(): Promise<CaptureResult> {
    return { ok: true, provider: "openai-codex" };
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

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let channel: SpyChannel;
let deps: ControlPlaneDeps;
let agentId = "";

beforeEach(async () => {
  store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  channel = new SpyChannel();
  deps = {
    verifier: {
      async verify() {
        return null;
      },
    },
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: { gke: channel },
    vfs,
    capabilities: CAPS,
  };
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  agentId = agent.id;
});

function req(): IncomingMessage {
  const stream = Readable.from([]);
  return Object.assign(stream, { headers: {} }) as IncomingMessage;
}

function res() {
  const out = {
    status: 0,
    body: "",
    writeHead(status: number) {
      this.status = status;
      return this;
    },
    end(chunk?: unknown) {
      this.body = chunk ? String(chunk) : "";
      return this;
    },
  };
  return out as unknown as ServerResponse & typeof out;
}

async function probe(
  d: ControlPlaneDeps,
  userId: string,
  method: string,
  path: string,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const entry = {
    deps: d,
    userId,
    method,
    path,
    url,
    req: request,
    res: response,
  };
  return (
    (await dispatchGroup("agent-activity", entry)) ||
    (await dispatchGroup("agent-proxy", entry))
  );
}

async function activity(who = "alice", id = agentId) {
  const path = `/agents/${encodeURIComponent(id)}/activity`;
  const url = new URL(path, "http://host.local");
  const response = res();
  const handled = await probe(deps, who, "GET", path, url, req(), response);
  return { handled, response, json: JSON.parse(response.body || "{}") };
}

async function seedRun(run: RoutineRun): Promise<void> {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.getAgent(agentId);
  if (!agent) throw new Error("expected agent to exist");
  await saveRoutineRuns(vfs, workspaceRoot(ws, agent), [run]);
}

const routine: Routine = {
  id: "routine-1",
  name: "Daily report",
  prompt: "write the report",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("reports idle activity without falling through to runtime dispatch", async () => {
  const { handled, response, json } = await activity();
  expect(handled).toBe(true);
  expect(response.status).toBe(200);
  expect(json).toEqual({
    busy: false,
    runtime: "running",
    turnBusy: false,
    loginPending: false,
    runningRoutineRuns: 0,
    activeRequests: 0,
    activeWrites: 0,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
  expect(channel.dispatched).toEqual([]);
});

test("reports busy when the channel has an active turn", async () => {
  channel.busyResult = true;
  const { response, json } = await activity();
  expect(response.status).toBe(200);
  expect(json).toEqual({
    busy: true,
    runtime: "running",
    turnBusy: true,
    loginPending: false,
    runningRoutineRuns: 0,
    activeRequests: 0,
    activeWrites: 0,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("reports busy when a routine run is still running", async () => {
  await seedRun(createRoutineRun(routine, "run-1", "2026-01-01T00:00:00.000Z"));

  const { response, json } = await activity();
  expect(response.status).toBe(200);
  expect(json).toEqual({
    busy: true,
    runtime: "running",
    turnBusy: false,
    loginPending: false,
    runningRoutineRuns: 1,
    activeRequests: 0,
    activeWrites: 0,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("counts OTHER held /agents/* requests as busy (open SSE stream)", async () => {
  deps.agentRequestCount = () => 1;
  expect((await activity()).json).toMatchObject({
    busy: false,
    activeRequests: 0,
  });

  deps.agentRequestCount = () => 2;
  expect((await activity()).json).toMatchObject({
    busy: true,
    activeRequests: 1,
  });
});

test("reports a sign-in waiting on its user apart from busy", async () => {
  channel.loginPendingResult = true;
  expect((await activity()).json).toMatchObject({
    busy: false,
    turnBusy: false,
    loginPending: true,
  });
});

test("reports a running turn and held writes apart from open reads", async () => {
  deps.agentRequestCount = () => 2;
  deps.agentWriteCount = () => 0;
  expect((await activity()).json).toMatchObject({
    busy: true,
    turnBusy: false,
    activeRequests: 1,
    activeWrites: 0,
  });

  deps.agentRequestCount = () => 3;
  deps.agentWriteCount = () => 1;
  channel.busyResult = true;
  expect((await activity()).json).toMatchObject({
    busy: true,
    turnBusy: true,
    activeRequests: 2,
    activeWrites: 1,
  });
});

test("reports approvals and custom sign-ins held in memory apart from busy", async () => {
  assistantApprovals.issue({
    operation: "delete_agent",
    params: { agent: "x" },
    agentId,
    conversationId: "whatsapp",
    summary: "s",
  });
  deps.customIntegrations = {
    pendingOAuthAttempts: 2,
  } as unknown as CustomIntegrationManager;
  try {
    expect((await activity()).json).toMatchObject({
      busy: false,
      turnBusy: false,
      pendingApprovals: 1,
      pendingOAuth: 2,
    });
    expect(assistantApprovals.pendingCount("someone-else")).toBe(0);
  } finally {
    assistantApprovals.retireExcept(agentId, "whatsapp", []);
  }
  expect((await activity()).json).toMatchObject({ pendingApprovals: 0 });
});

test("POST /conversations/:cid/dismiss-interaction reaches the runtime dispatch", async () => {
  const path = `/agents/${encodeURIComponent(agentId)}/conversations/c1/dismiss-interaction`;
  const url = new URL(path, "http://host.local");
  const handled = await probe(deps, "alice", "POST", path, url, req(), res());
  expect(handled).toBe(true);
  expect(channel.dispatched).toEqual(["conversations/c1/dismiss-interaction"]);
});

test("unknown or unauthorized agents follow the existing authz statuses", async () => {
  const unknown = await activity("alice", "nope");
  expect(unknown.response.status).toBe(404);

  const forbidden = await activity("bob");
  expect(forbidden.response.status).toBe(403);
});

test("pod probe: a genuinely idle host answers busy:false", async () => {
  expect(await podActivityStatus(deps)).toEqual({
    busy: false,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 0,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("pod probe: any agent with an active turn flips the pod busy", async () => {
  channel.busyResult = true;
  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 1,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("pod probe: sums running routine runs across EVERY workspace, not one user's", async () => {
  await seedRun(createRoutineRun(routine, "run-1", "2026-01-01T00:00:00.000Z"));
  const bobWs = await store.getOrCreatePersonalWorkspace("bob");
  const bobAgent = await store.createAgent({
    workspaceId: bobWs.id,
    name: "BobHelper",
  });
  await saveRoutineRuns(vfs, workspaceRoot(bobWs, bobAgent), [
    createRoutineRun(routine, "run-2", "2026-01-01T00:00:00.000Z"),
  ]);

  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 2,
    busyAgents: 2,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("pod probe: held /agents/* requests count once, with NO self-subtraction", async () => {
  deps.agentRequestCount = () => 1;
  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 1,
    runningRoutineRuns: 0,
    busyAgents: 0,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("pod probe: an unprobeable agent reads busy, never a false idle", async () => {
  expect(await podActivityStatus({ ...deps, channels: {} })).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 1,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });

  channel.busy = async () => {
    throw new Error("runtime unreachable");
  };
  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 1,
    pendingApprovals: 0,
    pendingOAuth: 0,
  });
});

test("pod probe: sums held approvals over the pod's agents and reports custom sign-ins", async () => {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const other = await store.createAgent({ workspaceId: ws.id, name: "Other" });
  for (const id of [agentId, other.id])
    assistantApprovals.issue({
      operation: "delete_agent",
      params: { agent: id },
      agentId: id,
      conversationId: "c1",
      summary: "s",
    });
  deps.customIntegrations = {
    pendingOAuthAttempts: 1,
  } as unknown as CustomIntegrationManager;
  try {
    expect(await podActivityStatus(deps)).toMatchObject({
      busy: false,
      pendingApprovals: 2,
      pendingOAuth: 1,
    });
  } finally {
    assistantApprovals.clear(agentId);
    assistantApprovals.clear(other.id);
  }
});

test("GET /activity over HTTP: 401 unauthenticated; a held per-agent stream keeps the pod busy", async () => {
  deps.verifier = {
    async verify(bearer: string) {
      return bearer === "pod-token" ? { userId: "alice" } : null;
    },
  };
  let release: (() => void) | undefined;
  channel.dispatch = async (
    _ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: IncomingMessage,
    streamRes: ServerResponse,
  ) => {
    streamRes.writeHead(200, { "content-type": "text/event-stream" });
    streamRes.write(": hb\n\n");
    await new Promise<void>((resolve) => {
      release = () => {
        streamRes.end();
        resolve();
      };
    });
  };
  const server = createControlPlaneServer(deps);
  await new Promise<void>((r) => {
    server.listen(0, "127.0.0.1", () => r());
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const auth = { Authorization: "Bearer pod-token" };
  try {
    expect((await fetch(`${base}/activity`)).status).toBe(401);

    const idle = await fetch(`${base}/activity`, { headers: auth });
    expect(idle.status).toBe(200);
    expect(await idle.json()).toEqual({
      busy: false,
      activeRequests: 0,
      runningRoutineRuns: 0,
      busyAgents: 0,
      pendingApprovals: 0,
      pendingOAuth: 0,
    });

    const held = fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/conversations/c1/events`,
      { headers: auth },
    );
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    const probe = await fetch(`${base}/activity`, { headers: auth });
    expect(await probe.json()).toMatchObject({
      busy: true,
      activeRequests: 1,
    });

    release?.();
    await (await held).text();
    await vi.waitFor(async () => {
      const after = await fetch(`${base}/activity`, { headers: auth });
      expect(await after.json()).toMatchObject({
        busy: false,
        activeRequests: 0,
      });
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r(null)));
  }
});

test("the real server wires the counter: a held stream reads busy over HTTP", async () => {
  deps.verifier = {
    async verify() {
      return { userId: "alice" };
    },
  };
  let release: (() => void) | undefined;
  channel.dispatch = async (
    _ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: IncomingMessage,
    streamRes: ServerResponse,
  ) => {
    streamRes.writeHead(200, { "content-type": "text/event-stream" });
    streamRes.write(": hb\n\n");
    await new Promise<void>((resolve) => {
      release = () => {
        streamRes.end();
        resolve();
      };
    });
  };
  const server = createControlPlaneServer(deps);
  await new Promise<void>((r) => {
    server.listen(0, "127.0.0.1", () => r());
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const auth = { Authorization: "Bearer token" };
  try {
    const held = fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/conversations/c1/events`,
      { headers: auth },
    );
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });

    const probe = await fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/activity`,
      { headers: auth },
    );
    expect(await probe.json()).toMatchObject({
      busy: true,
      activeRequests: 1,
    });

    release?.();
    await (await held).text();
    await vi.waitFor(async () => {
      const after = await fetch(
        `${base}/agents/${encodeURIComponent(agentId)}/activity`,
        { headers: auth },
      );
      expect(await after.json()).toMatchObject({
        busy: false,
        activeRequests: 0,
      });
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r(null)));
  }
});

test("the real server counts a held write, and never a held read, as a write", async () => {
  deps.verifier = {
    async verify() {
      return { userId: "alice" };
    },
  };
  const releases: (() => void)[] = [];
  channel.dispatch = async (
    _ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: IncomingMessage,
    heldRes: ServerResponse,
  ) => {
    heldRes.writeHead(200, { "content-type": "text/event-stream" });
    heldRes.write(": hb\n\n");
    await new Promise<void>((resolve) => {
      releases.push(() => {
        heldRes.end();
        resolve();
      });
    });
  };
  const server = createControlPlaneServer(deps);
  await new Promise<void>((r) => {
    server.listen(0, "127.0.0.1", () => r());
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const auth = { Authorization: "Bearer token" };
  const agentBase = `${base}/agents/${encodeURIComponent(agentId)}`;
  const probe = async () =>
    (await fetch(`${agentBase}/activity`, { headers: auth })).json();
  try {
    const stream = fetch(`${agentBase}/conversations/c1/events`, {
      headers: auth,
    });
    await vi.waitFor(() => {
      expect(releases).toHaveLength(1);
    });
    expect(await probe()).toMatchObject({ activeRequests: 1, activeWrites: 0 });

    const write = fetch(`${agentBase}/conversations/c1/import`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: "{}",
    });
    await vi.waitFor(() => {
      expect(releases).toHaveLength(2);
    });
    expect(await probe()).toMatchObject({ activeRequests: 2, activeWrites: 1 });

    for (const release of releases) release();
    await (await stream).text();
    await (await write).text();
    await vi.waitFor(async () => {
      expect(await probe()).toMatchObject({
        activeRequests: 0,
        activeWrites: 0,
      });
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r(null)));
  }
});

test("a write keeps counting after its client hangs up, until its handler settles", async () => {
  deps.verifier = {
    async verify() {
      return { userId: "alice" };
    },
  };
  let started = false;
  let finish: (() => void) | undefined;
  channel.dispatch = async (
    _ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: IncomingMessage,
    writeRes: ServerResponse,
  ) => {
    started = true;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    if (!writeRes.writableEnded) writeRes.end();
  };
  const server = createControlPlaneServer(deps);
  await new Promise<void>((r) => {
    server.listen(0, "127.0.0.1", () => r());
  });
  const { port } = server.address() as AddressInfo;
  const agentBase = `http://127.0.0.1:${port}/agents/${encodeURIComponent(agentId)}`;
  const auth = { Authorization: "Bearer token" };
  const probe = async () =>
    (await fetch(`${agentBase}/activity`, { headers: auth })).json();
  try {
    const abort = new AbortController();
    const write = fetch(`${agentBase}/conversations/c1/import`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: "{}",
      signal: abort.signal,
    }).catch(() => null);
    await vi.waitFor(() => {
      expect(started).toBe(true);
    });
    abort.abort();
    await write;
    await vi.waitFor(async () => {
      expect(await probe()).toMatchObject({ activeRequests: 0 });
    });
    expect(await probe()).toMatchObject({ activeWrites: 1 });

    finish?.();
    await vi.waitFor(async () => {
      expect(await probe()).toMatchObject({ activeWrites: 0 });
    });
  } finally {
    finish?.();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r(null)));
  }
});
