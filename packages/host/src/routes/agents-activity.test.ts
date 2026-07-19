import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { createRoutineRun, saveRoutineRuns } from "@houston/domain";
import type { Capabilities, Routine, RoutineRun } from "@houston/protocol";
import { beforeEach, expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
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
import { handleAgents, podActivityStatus } from "./agents";

/**
 * GET /agents/:id/activity — gateway idle-sleep probe. It reports whether any
 * runtime turn or routine run is still active, without falling through to the
 * runtime dispatch surface.
 */

class SpyChannel implements RuntimeChannel {
  busyResult = false;
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

async function activity(who = "alice", id = agentId) {
  const path = `/agents/${encodeURIComponent(id)}/activity`;
  const url = new URL(path, "http://host.local");
  const response = res();
  const handled = await handleAgents(
    deps,
    who,
    "GET",
    path,
    url,
    req(),
    response,
  );
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
    runningRoutineRuns: 0,
    activeRequests: 0,
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
    runningRoutineRuns: 0,
    activeRequests: 0,
  });
});

test("reports busy when a routine run is still running", async () => {
  await seedRun(createRoutineRun(routine, "run-1", "2026-01-01T00:00:00.000Z"));

  const { response, json } = await activity();
  expect(response.status).toBe(200);
  expect(json).toEqual({
    busy: true,
    runtime: "running",
    runningRoutineRuns: 1,
    activeRequests: 0,
  });
});

test("counts OTHER held /agents/* requests as busy (open SSE stream)", async () => {
  // The probe itself is one of the counted requests — 1 means "just me".
  deps.agentRequestCount = () => 1;
  expect((await activity()).json).toMatchObject({
    busy: false,
    activeRequests: 0,
  });

  // A second held request (a conversation-events subscription, a streaming
  // turn reply) keeps the pod busy even with no turn and no routine run.
  deps.agentRequestCount = () => 2;
  expect((await activity()).json).toMatchObject({
    busy: true,
    activeRequests: 1,
  });
});

test("POST /conversations/:cid/dismiss-interaction reaches the runtime dispatch", async () => {
  const path = `/agents/${encodeURIComponent(agentId)}/conversations/c1/dismiss-interaction`;
  const url = new URL(path, "http://host.local");
  const handled = await handleAgents(
    deps,
    "alice",
    "POST",
    path,
    url,
    req(),
    res(),
  );
  expect(handled).toBe(true);
  expect(channel.dispatched).toEqual(["conversations/c1/dismiss-interaction"]);
});

test("unknown or unauthorized agents follow the existing authz statuses", async () => {
  const unknown = await activity("alice", "nope");
  expect(unknown.response.status).toBe(404);

  const forbidden = await activity("bob");
  expect(forbidden.response.status).toBe(403);
});

// --- GET /activity — the pod-level aggregate (server.ts) ---------------------
//
// The control plane's pre-roll busy probe: a single answer for the whole pod,
// no agent enumeration on the caller's side, so busy-aware engine rolls can
// defer a restart that would kill an in-flight turn. Aggregation semantics are
// unit-tested against podActivityStatus; the HTTP test below pins auth and
// the counter wiring (the probe lives outside /agents/, so it never counts
// itself).

test("pod probe: a genuinely idle host answers busy:false", async () => {
  expect(await podActivityStatus(deps)).toEqual({
    busy: false,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 0,
  });
});

test("pod probe: any agent with an active turn flips the pod busy", async () => {
  channel.busyResult = true;
  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 1,
  });
});

test("pod probe: sums running routine runs across EVERY workspace, not one user's", async () => {
  // alice's agent has a running run; so does bob's, in a different workspace —
  // engine pods are single-tenant, so the pod answer spans the whole store.
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
  });
});

test("pod probe: held /agents/* requests count once, with NO self-subtraction", async () => {
  // Unlike the per-agent probe (which is itself a counted /agents/* request
  // and subtracts one), /activity is outside the counted prefix — a count of
  // 1 means one genuinely held per-agent request, and the pod is busy.
  deps.agentRequestCount = () => 1;
  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 1,
    runningRoutineRuns: 0,
    busyAgents: 0,
  });
});

test("pod probe: an unprobeable agent reads busy, never a false idle", async () => {
  // No channel wired for the workspace's runtime → conservative busy.
  expect(await podActivityStatus({ ...deps, channels: {} })).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 1,
  });

  // A probe that throws (runtime unreachable) counts the same way.
  channel.busy = async () => {
    throw new Error("runtime unreachable");
  };
  expect(await podActivityStatus(deps)).toEqual({
    busy: true,
    activeRequests: 0,
    runningRoutineRuns: 0,
    busyAgents: 1,
  });
});

test("GET /activity over HTTP: 401 unauthenticated; a held per-agent stream keeps the pod busy", async () => {
  deps.verifier = {
    async verify(bearer: string) {
      return bearer === "pod-token" ? { userId: "alice" } : null;
    },
  };
  // A dispatch that streams and never ends on its own — an open per-agent SSE
  // subscription, exactly what a roll must not restart the pod under.
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

    // Idle, and the probe itself never counts (it is not an /agents/* request).
    const idle = await fetch(`${base}/activity`, { headers: auth });
    expect(idle.status).toBe(200);
    expect(await idle.json()).toEqual({
      busy: false,
      activeRequests: 0,
      runningRoutineRuns: 0,
      busyAgents: 0,
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
    // The stream ended → its count is released and the pod reads idle again.
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
  // A dispatch that streams and never ends on its own — an open per-agent
  // SSE subscription, as the gateway proxies it.
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
    // The stream ended → its count is released and the pod reads idle again.
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
