import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, expect, test, vi } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  RuntimeLauncher,
  WorkspaceStore,
} from "../ports";
import type { ControlPlaneDeps } from "../server";
import { LocalWorkspaceStore } from "../store/local";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import type { AgentRouteDeps } from "./agent-authz";
import {
  delegationDocKey,
  readAgentDelegation,
  writeAgentDelegation,
} from "./agent-delegation-store";
import { liveTurns } from "./live-turn";
import { missionFanout } from "./mission-fanout";
import { dispatchGroup } from "./registry/all";

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
  async withQuiesced<T>(ctx: ChannelCtx, fn: () => Promise<T>): Promise<T> {
    if (this.quiesceError) throw this.quiesceError;
    this.calls.push(`quiesce:${ctx.agent.id}`);
    return await fn();
  }
  async teardown(ctx: ChannelCtx) {
    this.calls.push(`teardown:${ctx.agent.id}`);
  }
  async captureCredential(): Promise<CaptureResult> {
    return { ok: true, provider: "anthropic" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveClaudeOAuthCredential() {}
  async saveCustomEndpoint() {}
}

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
  d: AgentRouteDeps = deps(),
  id = agentId,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const path = `/agents/${encodeURIComponent(id)}`;
  const response = res();
  const handled = await dispatchGroup("agent-crud", {
    deps: d,
    userId: "alice",
    method: "PATCH",
    path,
    url: new URL(path, "http://host.local"),
    req: reqWithBody({ name }),
    res: response,
  });
  expect(handled).toBe(true);
  return { status: response.status, json: JSON.parse(response.body || "{}") };
}

test("delete of N cannot prune A's policy after A is renamed to N", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-delete-rename-"));
  try {
    const store = new LocalWorkspaceStore(root, "alice");
    const workspace = await store.getOrCreatePersonalWorkspace("alice");
    const a = await store.createAgent({ workspaceId: workspace.id, name: "A" });
    const n = await store.createAgent({ workspaceId: workspace.id, name: "N" });
    await writeAgentDelegation(vfs, workspace.id, a.id, {
      mode: "off",
      agents: [],
      acceptsMissions: false,
    });
    const d = { store, channels: { local: channel }, vfs };
    const originalDelete = d.store.deleteAgent.bind(d.store);
    let entered: (() => void) | undefined;
    let resume: (() => void) | undefined;
    const deleted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    d.store.deleteAgent = async (id) => {
      await originalDelete(id);
      entered?.();
      await gate;
    };
    const path = `/agents/${encodeURIComponent(n.id)}`;
    const response = res();
    const deleting = dispatchGroup("agent-crud", {
      deps: d,
      userId: "alice",
      method: "DELETE",
      path,
      url: new URL(path, "http://host.local"),
      req: reqWithBody({}),
      res: response,
    });
    await deleted;
    const renaming = rename("N", d, a.id);
    await Promise.race([
      renaming,
      new Promise((resolve) => setTimeout(resolve, 30)),
    ]);
    resume?.();
    await deleting;
    expect((await renaming).status).toBe(200);
    expect(await readAgentDelegation(vfs, workspace.id, n.id)).toMatchObject({
      mode: "off",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a conflicting local rename leaves the destination agent's explicit policy intact", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-rename-policy-"));
  try {
    const store = new LocalWorkspaceStore(root, "alice");
    const workspace = await store.getOrCreatePersonalWorkspace("alice");
    const a = await store.createAgent({ workspaceId: workspace.id, name: "A" });
    const b = await store.createAgent({ workspaceId: workspace.id, name: "B" });
    await vfs.writeText(
      delegationDocKey(workspace.id),
      JSON.stringify({
        version: 1,
        agents: {
          [a.id]: { mode: "all", agents: [], acceptsMissions: true },
          [b.id]: { mode: "off", agents: [], acceptsMissions: false },
        },
      }),
    );
    const before = await vfs.readText(delegationDocKey(workspace.id));
    const result = await rename("B", { store, channels: {}, vfs }, a.id);
    expect(result.status).toBe(409);
    expect(await vfs.readText(delegationDocKey(workspace.id))).toBe(before);
    expect(await readAgentDelegation(vfs, workspace.id, b.id)).toEqual({
      mode: "off",
      agents: [],
      acceptsMissions: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent local renames to one name preserve the winner's policy", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-rename-race-"));
  try {
    const store = new LocalWorkspaceStore(root, "alice");
    const workspace = await store.getOrCreatePersonalWorkspace("alice");
    const a = await store.createAgent({ workspaceId: workspace.id, name: "A" });
    const b = await store.createAgent({ workspaceId: workspace.id, name: "B" });
    await vfs.writeText(
      delegationDocKey(workspace.id),
      JSON.stringify({
        version: 1,
        agents: {
          [a.id]: { mode: "off", agents: [], acceptsMissions: false },
          [b.id]: { mode: "picked", agents: [], acceptsMissions: true },
        },
      }),
    );
    const outcomes = await Promise.all([
      rename("C", { store, channels: {}, vfs }, a.id),
      rename("C", { store, channels: {}, vfs }, b.id),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = (await store.getAgent(a.id)) ? b : a;
    expect(
      await readAgentDelegation(vfs, workspace.id, `${workspace.id}/C`),
    ).toMatchObject(
      winner.id === a.id
        ? { mode: "off", acceptsMissions: false }
        : { mode: "picked", acceptsMissions: true },
    );
    expect(
      await readAgentDelegation(vfs, workspace.id, winner.id),
    ).toMatchObject({ mode: "all" });
    const loser = winner.id === a.id ? b : a;
    expect(
      await readAgentDelegation(vfs, workspace.id, loser.id),
    ).toMatchObject(
      loser.id === a.id
        ? { mode: "off", acceptsMissions: false }
        : { mode: "picked", acceptsMissions: true },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rename quiesces the standing runtime BEFORE the store moves the directory", async () => {
  const { status, json } = await rename("Marketing");
  expect(status).toBe(200);
  expect(json.name).toBe("Marketing");
  expect(calls).toEqual([`quiesce:${agentId}`, `rename:${agentId}:Marketing`]);
});

test("a same-name PATCH never kills the runtime (no-op rename)", async () => {
  const { status } = await rename("Sales");
  expect(status).toBe(200);
  expect(calls).toEqual([`rename:${agentId}:Sales`]);
});

test("a quiesce failure surfaces and the rename does NOT run", async () => {
  channel.quiesceError = new Error("runtime refused to die");
  await expect(rename("Marketing")).rejects.toThrow("runtime refused to die");
  expect(calls).toEqual([]);
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
  await vfs.writeText(
    `ws/${workspaceId}/${agentId}/workspace/.houston/agent.json`,
    JSON.stringify({ id: "legacy", config_id: "blank", color: "forest" }),
  );

  const { json } = await rename("Marketing");
  expect(json.color).toBe("forest");

  const response = res();
  await dispatchGroup("agents", {
    deps: deps() as unknown as ControlPlaneDeps,
    userId: "alice",
    method: "GET",
    path: "/agents",
    url: new URL("/agents", "http://host.local"),
    req: reqWithBody({}),
    res: response,
  });
  const list = JSON.parse(response.body) as Array<Record<string, unknown>>;
  expect(list).toHaveLength(1);
  expect(list[0]?.color).toBe("forest");
});

test("an agent with no legacy metadata serves no color at all", async () => {
  const { json } = await rename("Marketing");
  expect("color" in json).toBe(false);
});

test("ProxyChannel.withQuiesced sleeps the agent's runtime without destroying it", async () => {
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
      removeIfAccess: async () => false,
    },
    forwardActingHeader: false,
  });
  const ws = await memory.getWorkspace(workspaceId);
  const agent = await memory.getAgent(agentId);
  if (!ws || !agent) throw new Error("fixture agent missing");
  await proxy.withQuiesced({ workspace: ws, agent }, async () => {});
  expect(slept).toEqual([agentId]);
  expect(destroyed).toEqual([]);
});

test("an invalid name answers 400 without touching runtime or store (HOU-1166)", async () => {
  for (const bad of ["has/slash", "back\\slash", "a..b", ".hidden"]) {
    const { status, json } = await rename(bad);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/agent name/);
  }
  expect(calls).toEqual([]);
});

test("rename trims the submitted name before storing it", async () => {
  const { status, json } = await rename("  Marketing  ");
  expect(status).toBe(200);
  expect(json.name).toBe("Marketing");
});

test("a policy copy failure refuses rename before the directory moves", async () => {
  const nextId = `${workspaceId}/Marketing`;
  await vfs.writeText(
    delegationDocKey(workspaceId),
    JSON.stringify({
      version: 1,
      agents: {
        [agentId]: { mode: "off", agents: [], acceptsMissions: false },
      },
    }),
  );
  const base = deps();
  const moved = {
    ...base,
    store: {
      ...base.store,
      renameAgent: async (id: string, name: string) => ({
        ...(await base.store.renameAgent(id, name)),
        id: `${workspaceId}/${name}`,
      }),
    },
  };
  vi.spyOn(vfs, "writeText").mockRejectedValueOnce(
    new Error("policy write failed"),
  );
  await expect(rename("Marketing", moved)).rejects.toThrow(
    "policy write failed",
  );
  expect(calls).not.toContain(`rename:${agentId}:Marketing`);
  expect(await readAgentDelegation(vfs, workspaceId, nextId)).toMatchObject({
    mode: "all",
  });
  expect(await readAgentDelegation(vfs, workspaceId, agentId)).toMatchObject({
    mode: "off",
  });
});

test("a failed policy cleanup after the directory moves closes the new id", async () => {
  const nextId = `${workspaceId}/Marketing`;
  await vfs.writeText(
    delegationDocKey(workspaceId),
    JSON.stringify({
      version: 1,
      agents: {
        [agentId]: { mode: "off", agents: [], acceptsMissions: false },
      },
    }),
  );
  const base = deps();
  const moved = {
    ...base,
    store: {
      ...base.store,
      renameAgent: async (id: string, name: string) => ({
        ...(await base.store.renameAgent(id, name)),
        id: `${workspaceId}/${name}`,
      }),
    },
  };
  const write = vfs.writeText.bind(vfs);
  vi.spyOn(vfs, "writeText")
    .mockImplementationOnce(write)
    .mockRejectedValueOnce(new Error("policy cleanup failed"));
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(rename("Marketing", moved)).rejects.toThrow(
      "policy cleanup failed",
    );
    expect(calls).toContain(`rename:${agentId}:Marketing`);
    expect(await readAgentDelegation(vfs, workspaceId, nextId)).toEqual({
      mode: "off",
      agents: [],
      acceptsMissions: false,
    });
  } finally {
    report.mockRestore();
  }
});

test("a failed directory rename rolls back its policy copy", async () => {
  const nextId = `${workspaceId}/Marketing`;
  await vfs.writeText(
    delegationDocKey(workspaceId),
    JSON.stringify({
      version: 1,
      agents: {
        [agentId]: { mode: "off", agents: [], acceptsMissions: false },
      },
    }),
  );
  const base = deps();
  const rejected = {
    ...base,
    store: {
      ...base.store,
      renameAgent: async () => {
        throw new Error("directory rename failed");
      },
    },
  };
  await expect(rename("Marketing", rejected)).rejects.toThrow(
    "directory rename failed",
  );
  expect(await readAgentDelegation(vfs, workspaceId, nextId)).toMatchObject({
    mode: "all",
  });
  expect(await readAgentDelegation(vfs, workspaceId, agentId)).toMatchObject({
    mode: "off",
  });
  const doc = JSON.parse(
    (await vfs.readText(delegationDocKey(workspaceId))) ?? "{}",
  ) as { agents: Record<string, unknown> };
  expect(doc.agents[nextId]).toBeUndefined();
});

test("a failed directory rename restores an orphan destination's prior raw policy", async () => {
  const nextId = `${workspaceId}/Marketing`;
  const prior = { mode: "picked", agents: [], acceptsMissions: false };
  await vfs.writeText(
    delegationDocKey(workspaceId),
    JSON.stringify({
      version: 1,
      agents: {
        [agentId]: { mode: "off", agents: [], acceptsMissions: false },
        [nextId]: prior,
      },
    }),
  );
  const base = deps();
  const rejected = {
    ...base,
    store: {
      ...base.store,
      renameAgent: async () => {
        throw new Error("directory rename failed");
      },
    },
  };
  await expect(rename("Marketing", rejected)).rejects.toThrow(
    "directory rename failed",
  );
  const doc = JSON.parse(
    (await vfs.readText(delegationDocKey(workspaceId))) ?? "{}",
  ) as { agents: Record<string, unknown> };
  expect(doc.agents[nextId]).toEqual(prior);
});

test("DELETE runs inside the quiesced span too (a stale dispatch must not resurrect a deleted agent)", async () => {
  const path = `/agents/${encodeURIComponent(agentId)}`;
  const response = res();
  const handled = await dispatchGroup("agent-crud", {
    deps: deps(channel),
    userId: "alice",
    method: "DELETE",
    path,
    url: new URL(path, "http://host.local"),
    req: reqWithBody({}),
    res: response,
  });
  expect(handled).toBe(true);
  expect(response.status).toBe(200);
  expect(calls).toEqual([`quiesce:${agentId}`, `teardown:${agentId}`]);
  expect(await memory.getAgent(agentId)).toBeNull();
});

function seedAgentState(id: string): string {
  liveTurns.start(id, "conv-1", "execute");
  missionFanout.record(id, { missionId: "m1", boardRoot: null });
  return assistantApprovals.issue({
    operation: "deleteAgent",
    params: { agentPath: id },
    agentId: id,
    conversationId: "conv-1",
    summary: "Delete it?",
  }).requestId;
}

test("a rename takes the old id's approvals, turn and fan-out with it", async () => {
  const requestId = seedAgentState(agentId);
  const base = deps();
  const moved = {
    ...base,
    store: {
      ...base.store,
      renameAgent: async (id: string, name: string) => ({
        ...(await base.store.renameAgent(id, name)),
        id: `${workspaceId}/${name}`,
      }),
    },
  };
  const { status } = await rename("Marketing", moved);
  expect(status).toBe(200);
  expect(assistantApprovals.pending(requestId, agentId)).toBeUndefined();
  expect(liveTurns.get(agentId, "conv-1")).toBeUndefined();
  expect(await missionFanout.running(agentId, vfs)).toBe(0);
});

test("a delete leaves nothing behind for the next agent on that path", async () => {
  const requestId = seedAgentState(agentId);
  const path = `/agents/${encodeURIComponent(agentId)}`;
  const response = res();
  await dispatchGroup("agent-crud", {
    deps: deps(channel),
    userId: "alice",
    method: "DELETE",
    path,
    url: new URL(path, "http://host.local"),
    req: reqWithBody({}),
    res: response,
  });
  expect(response.status).toBe(200);
  expect(assistantApprovals.pending(requestId, agentId)).toBeUndefined();
  expect(liveTurns.get(agentId, "conv-1")).toBeUndefined();
  expect(await missionFanout.running(agentId, vfs)).toBe(0);
});
