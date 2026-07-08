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
import { handleAgents } from "./agents";

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

test("unknown or unauthorized agents follow the existing authz statuses", async () => {
  const unknown = await activity("alice", "nope");
  expect(unknown.response.status).toBe(404);

  const forbidden = await activity("bob");
  expect(forbidden.response.status).toBe(403);
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
