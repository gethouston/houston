import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, test } from "vitest";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  RuntimeLauncher,
  WorkspaceStore,
} from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { handleAgents } from "./agents";

/**
 * PATCH /agents/:id (rename) — the runtime-quiesce contract.
 *
 * The reported bug: a rename moved the agent's directory while its warm local
 * runtime kept running with absolute paths into the OLD directory; the
 * runtime's next write resurrected the old-named folder, which the
 * directory-derived store re-listed as an agent with the old name ("my rename
 * reverted"). The route must quiesce the standing runtime BEFORE the store
 * rename — and surface a quiesce failure instead of renaming under a live
 * runtime. Also covers the legacy Rust-era color riding rename/list payloads.
 */

class SpyChannel implements RuntimeChannel {
  constructor(private readonly calls: string[]) {}
  quiesceError: Error | null = null;

  async dispatch(
    _ctx: ChannelCtx,
    _method: string,
    _rest: string,
    _url: URL,
    _req: IncomingMessage,
    res: ServerResponse,
  ) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unexpected dispatch" }));
  }
  async fireTurn() {}
  async cancelTurn() {
    return false;
  }
  async busy() {
    return false;
  }
  async quiesce(ctx: ChannelCtx) {
    if (this.quiesceError) throw this.quiesceError;
    this.calls.push(`quiesce:${ctx.agent.id}`);
  }
  async teardown() {}
  async captureCredential(): Promise<CaptureResult> {
    return { ok: true, provider: "anthropic" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveClaudeOAuthCredential() {}
  async saveCustomEndpoint() {}
}

/** The same channel with `quiesce` absent — a per-turn channel's shape. */
function withoutQuiesce(channel: SpyChannel): RuntimeChannel {
  return {
    dispatch: channel.dispatch.bind(channel),
    fireTurn: channel.fireTurn.bind(channel),
    cancelTurn: channel.cancelTurn.bind(channel),
    busy: channel.busy.bind(channel),
    teardown: channel.teardown.bind(channel),
    captureCredential: channel.captureCredential.bind(channel),
    forgetCredential: channel.forgetCredential.bind(channel),
    saveApiKeyCredential: channel.saveApiKeyCredential.bind(channel),
    saveClaudeOAuthCredential: channel.saveClaudeOAuthCredential.bind(channel),
    saveCustomEndpoint: channel.saveCustomEndpoint.bind(channel),
  };
}

/** Delegating store that records rename calls into the shared ledger. */
function recordingStore(
  inner: MemoryWorkspaceStore,
  calls: string[],
): WorkspaceStore {
  return {
    getOrCreatePersonalWorkspace: (u) => inner.getOrCreatePersonalWorkspace(u),
    getWorkspace: (id) => inner.getWorkspace(id),
    getAgent: (id) => inner.getAgent(id),
    listAgents: (id) => inner.listAgents(id),
    listWorkspaces: () => inner.listWorkspaces(),
    listWorkspacesForUser: (u) => inner.listWorkspacesForUser(u),
    listAllAgents: () => inner.listAllAgents(),
    createAgent: (input) => inner.createAgent(input),
    renameAgent: (id, name) => {
      calls.push(`rename:${id}:${name}`);
      return inner.renameAgent(id, name);
    },
    deleteAgent: (id) => inner.deleteAgent(id),
    setWorkspaceRuntime: (id, runtime) =>
      inner.setWorkspaceRuntime(id, runtime),
  };
}

let memory: MemoryWorkspaceStore;
let calls: string[];
let channel: SpyChannel;
let vfs: MemoryVfs;
let agentId = "";
let workspaceId = "";

beforeEach(async () => {
  memory = new MemoryWorkspaceStore();
  calls = [];
  channel = new SpyChannel(calls);
  vfs = new MemoryVfs();
  const ws = await memory.getOrCreatePersonalWorkspace("alice");
  workspaceId = ws.id;
  const agent = await memory.createAgent({ workspaceId: ws.id, name: "Sales" });
  agentId = agent.id;
});

function deps(channelImpl: RuntimeChannel | null = channel) {
  return {
    store: recordingStore(memory, calls),
    channels: channelImpl ? { gke: channelImpl } : {},
    vfs,
  };
}

function reqWithBody(body: unknown): IncomingMessage {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))]);
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

async function rename(
  name: string,
  d: ReturnType<typeof deps> = deps(),
): Promise<{ status: number; json: Record<string, unknown> }> {
  const path = `/agents/${encodeURIComponent(agentId)}`;
  const response = res();
  const handled = await handleAgents(
    d,
    "alice",
    "PATCH",
    path,
    new URL(path, "http://host.local"),
    reqWithBody({ name }),
    response,
  );
  expect(handled).toBe(true);
  return { status: response.status, json: JSON.parse(response.body || "{}") };
}

test("rename quiesces the standing runtime BEFORE the store moves the directory", async () => {
  const { status, json } = await rename("Marketing");
  expect(status).toBe(200);
  expect(json.name).toBe("Marketing");
  expect(calls).toEqual([`quiesce:${agentId}`, `rename:${agentId}:Marketing`]);
});

test("a same-name PATCH never kills the runtime (no-op rename)", async () => {
  const { status } = await rename("Sales");
  expect(status).toBe(200);
  // The store still gets the (no-op) rename; only the quiesce is skipped.
  expect(calls).toEqual([`rename:${agentId}:Sales`]);
});

test("a quiesce failure surfaces and the rename does NOT run", async () => {
  channel.quiesceError = new Error("runtime refused to die");
  await expect(rename("Marketing")).rejects.toThrow("runtime refused to die");
  expect(calls).toEqual([]); // no rename recorded
  const agent = await memory.getAgent(agentId);
  expect(agent?.name).toBe("Sales");
});

test("rename still works over a channel with no quiesce (per-turn runtimes)", async () => {
  const { status, json } = await rename(
    "Marketing",
    deps(withoutQuiesce(channel)),
  );
  expect(status).toBe(200);
  expect(json.name).toBe("Marketing");
  expect(calls).toEqual([`rename:${agentId}:Marketing`]);
});

test("rename still works when the workspace has no channel wired", async () => {
  const { status, json } = await rename("Marketing", deps(null));
  expect(status).toBe(200);
  expect(json.name).toBe("Marketing");
  expect(calls).toEqual([`rename:${agentId}:Marketing`]);
});

test("the rename response and the agent list carry the legacy agent.json color", async () => {
  // CloudPaths (the deps default): agentRoot = ws/<wsId>/<agentId>/workspace.
  await vfs.writeText(
    `ws/${workspaceId}/${agentId}/workspace/.houston/agent.json`,
    JSON.stringify({ id: "legacy", config_id: "blank", color: "forest" }),
  );

  const { json } = await rename("Marketing");
  expect(json.color).toBe("forest");

  const response = res();
  await handleAgents(
    deps(),
    "alice",
    "GET",
    "/agents",
    new URL("/agents", "http://host.local"),
    reqWithBody({}),
    response,
  );
  const list = JSON.parse(response.body) as Array<Record<string, unknown>>;
  expect(list).toHaveLength(1);
  expect(list[0]?.color).toBe("forest");
});

test("an agent with no legacy metadata serves no color at all", async () => {
  const { json } = await rename("Marketing");
  expect("color" in json).toBe(false);
});

test("ProxyChannel.quiesce sleeps the agent's runtime without destroying it", async () => {
  const { ProxyChannel } = await import("../channel/proxy");
  const slept: string[] = [];
  const destroyed: string[] = [];
  const launcher: RuntimeLauncher = {
    ensureAwake: async () => ({ baseUrl: "http://127.0.0.1:1", token: "t" }),
    sleep: async (id) => {
      slept.push(id);
    },
    destroy: async (id) => {
      destroyed.push(id);
    },
    status: async () => "running" as const,
  };
  const proxy = new ProxyChannel({
    launcher,
    proxy: { forward: async () => {} },
    credentials: {
      put: async () => {},
      get: async () => null,
      remove: async () => {},
    },
    forwardActingHeader: false,
  });
  const ws = await memory.getWorkspace(workspaceId);
  const agent = await memory.getAgent(agentId);
  if (!ws || !agent) throw new Error("fixture agent missing");
  await proxy.quiesce({ workspace: ws, agent });
  expect(slept).toEqual([agentId]);
  expect(destroyed).toEqual([]);
});
