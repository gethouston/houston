import type { IncomingMessage, ServerResponse } from "node:http";
import { docKey, saveActivities } from "@houston/domain";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { FireTurnOptions } from "../fire-turn-options";
import { conversationKey, LocalPaths } from "../paths";
import type {
  CredentialVault,
  RuntimeChannel,
  TurnPin,
  WorkspaceStore,
} from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { writeAgentDelegation } from "./agent-delegation-store";
import { ASSISTANT_CP_URL_ENV, ASSISTANT_TOKEN_ENV } from "./assistant-wiring";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { liveTurns } from "./live-turn";
import { missionFanout } from "./mission-fanout";
import { handleSandboxMissions } from "./missions-sandbox";

const paths = new LocalPaths();

let restoreGateway: (() => void) | null = null;

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let caller: Agent;
let target: Agent;
let otherWs: Workspace;
let otherUsersAgent: Agent;
let callerRoot: string;
let targetRoot: string;
let events: HoustonEvent[];
let fired: {
  agentId: string;
  cid: string;
  text: string;
  pin?: TurnPin;
  actingAs?: string;
}[];

const vault: CredentialVault = {
  sandboxToken: () => "sb",
  validateSandboxToken: (token) =>
    token === "sb-good" ? { workspaceId: ws.id, agentId: caller.id } : null,
};

const channel = {
  async fireTurn(
    ctx: { agent: Agent },
    cid: string,
    text: string,
    pin?: TurnPin,
    { actingAs }: FireTurnOptions = {},
  ): Promise<void> {
    fired.push({
      agentId: ctx.agent.id,
      cid,
      text,
      pin,
      ...(actingAs ? { actingAs } : {}),
    });
  },
} as unknown as RuntimeChannel;

function fakeReq(
  body: unknown,
  headers: Record<string, string>,
): IncomingMessage {
  const buf =
    body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      if (buf.byteLength) yield buf;
    },
  } as unknown as IncomingMessage;
}

function fakeRes() {
  const captured: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

function withSecondDobby(): { store: WorkspaceStore; agent: Agent } {
  const teamWs: Workspace = {
    id: "ws-team",
    ownerUserId: ws.ownerUserId,
    kind: "personal",
    name: "Team",
    slug: "team",
    runtime: ws.runtime,
    createdAt: Date.now(),
  };
  const teamDobby: Agent = {
    id: "agent-team-dobby",
    workspaceId: teamWs.id,
    name: "Dobby",
    createdAt: Date.now(),
  };
  const delegate = Object.create(store) as MemoryWorkspaceStore;
  delegate.listWorkspacesForUser = async (userId) =>
    userId === ws.ownerUserId
      ? [...(await store.listWorkspacesForUser(userId)), teamWs]
      : store.listWorkspacesForUser(userId);
  delegate.getWorkspace = async (id) =>
    id === teamWs.id ? teamWs : store.getWorkspace(id);
  delegate.listAgents = async (id) =>
    id === teamWs.id ? [teamDobby] : store.listAgents(id);
  return { store: delegate, agent: teamDobby };
}

function stubGateway(
  calls: { url: string; init: RequestInit | undefined }[],
  routes: Record<string, unknown>,
): void {
  const previous = {
    url: process.env[ASSISTANT_CP_URL_ENV],
    token: process.env[ASSISTANT_TOKEN_ENV],
    agentUrl: process.env.HOUSTON_INTEGRATIONS_URL,
    hostToken: process.env.HOUSTON_HOST_TOKEN,
    fetch: globalThis.fetch,
  };
  restoreGateway = () => {
    process.env[ASSISTANT_CP_URL_ENV] = previous.url;
    process.env[ASSISTANT_TOKEN_ENV] = previous.token;
    process.env.HOUSTON_INTEGRATIONS_URL = previous.agentUrl;
    process.env.HOUSTON_HOST_TOKEN = previous.hostToken;
    globalThis.fetch = previous.fetch;
  };
  process.env[ASSISTANT_CP_URL_ENV] = "https://gw.test";
  process.env[ASSISTANT_TOKEN_ENV] = "gw-token";
  process.env.HOUSTON_INTEGRATIONS_URL = "https://gw.test";
  process.env.HOUSTON_HOST_TOKEN = "a".repeat(64);
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const payload = routes[path];
    const status =
      payload === undefined ? 404 : path.endsWith("/start") ? 201 : 200;
    return new Response(JSON.stringify(payload ?? { error: "not found" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function call(
  method: string,
  path: string,
  body: unknown,
  opts: {
    conversationId?: string;
    forgedConversationId?: string;
    search?: string;
    store?: WorkspaceStore;
    gatewayFronted?: boolean;
    actingAs?: string;
  } = {},
) {
  const headers: Record<string, string> = { authorization: "Bearer sb-good" };
  const claimed = opts.forgedConversationId ?? opts.conversationId;
  if (claimed) headers[CONVERSATION_ID_HEADER] = claimed;
  if (opts.conversationId)
    liveTurns.start(caller.id, opts.conversationId, "execute", {
      actingAs: opts.gatewayFronted
        ? (opts.actingAs ?? "acting-v1.test")
        : undefined,
    });
  else liveTurns.forget(caller.id);
  const { res, captured } = fakeRes();
  const url = new URL(`http://host${path}${opts.search ?? ""}`);
  const handled = await handleSandboxMissions(
    {
      vault,
      store: opts.store ?? store,
      ...(opts.gatewayFronted ? { gatewayFronted: true } : {}),
      vfs,
      paths,
      events: {
        emit: (_userId: string, event: HoustonEvent) => events.push(event),
      } as never,
      channels: { local: channel },
    },
    method,
    path,
    url,
    fakeReq(body, headers),
    res,
  );
  return { handled, ...captured };
}

async function boardOf(root: string): Promise<Activity[]> {
  return JSON.parse(
    (await vfs.readText(docKey(root, "activity"))) ?? "[]",
  ) as Activity[];
}

const PARENT: Activity = {
  id: "parent-1",
  title: "Plan the launch",
  description: "",
  status: "running",
  session_key: "conv-parent",
};

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  fired = [];
  ws = await store.getOrCreatePersonalWorkspace("alice");
  caller = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  target = await store.createAgent({ workspaceId: ws.id, name: "Dobby" });
  otherWs = await store.getOrCreatePersonalWorkspace("bob");
  otherUsersAgent = await store.createAgent({
    workspaceId: otherWs.id,
    name: "Winky",
  });
  callerRoot = paths.agentRoot(ws, caller);
  targetRoot = paths.agentRoot(ws, target);
  await saveActivities(vfs, callerRoot, [PARENT]);
});

afterEach(() => {
  missionFanout.forget(caller.id);
  vi.unstubAllEnvs();
  restoreGateway?.();
  restoreGateway = null;
});

test("off and picked policies restrict other boards, while the manager is exempt", async () => {
  await writeAgentDelegation(vfs, ws.id, caller.id, {
    mode: "off",
    agents: [],
    acceptsMissions: true,
  });
  const off = await call("GET", "/sandbox/missions", undefined, {
    search: "?agent=Dobby",
  });
  expect(off.body).toMatchObject({ code: "delegation_off" });
  const own = await call("GET", "/sandbox/missions", undefined);
  expect(own.status).toBe(200);

  await writeAgentDelegation(vfs, ws.id, caller.id, {
    mode: "picked",
    agents: [],
    acceptsMissions: true,
  });
  const picked = await call("GET", "/sandbox/missions", undefined, {
    search: "?agent=Dobby",
  });
  expect(picked.body).toMatchObject({ code: "agent_not_allowed" });

  await writeAgentDelegation(vfs, ws.id, caller.id, {
    mode: "picked",
    agents: [target.id],
    acceptsMissions: true,
  });
  const chosen = await call("GET", "/sandbox/missions", undefined, {
    search: "?agent=Dobby",
  });
  expect(chosen.status).toBe(200);

  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const manager = await call("GET", "/sandbox/missions", undefined, {
    search: "?agent=Dobby",
  });
  expect(manager.status).toBe(200);
});

test("an incoming block refuses starts but permits reads", async () => {
  await writeAgentDelegation(vfs, ws.id, target.id, {
    mode: "all",
    agents: [],
    acceptsMissions: false,
  });
  const start = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Dobby",
      title: "t",
      prompt: "p",
    },
    { conversationId: "conv-parent" },
  );
  expect(start.body).toMatchObject({ code: "agent_not_accepting" });
  const read = await call("GET", "/sandbox/missions", undefined, {
    search: "?agent=Dobby",
  });
  expect(read.status).toBe(200);
});

test("a cross-board move requires the caller's origin; an own-board move does not", async () => {
  const row: Activity = {
    id: "m-1",
    title: "Review",
    description: "",
    status: "needs_you",
  };
  await saveActivities(vfs, targetRoot, [row]);
  const denied = await call(
    "POST",
    "/sandbox/missions/status",
    {
      agent: "Dobby",
      id: row.id,
      status: "done",
    },
    { conversationId: "conv-parent" },
  );
  expect(denied.body).toMatchObject({ code: "not_mission_origin" });
  await saveActivities(vfs, targetRoot, [{ ...row, origin_agent: caller.id }]);
  const allowed = await call(
    "POST",
    "/sandbox/missions/status",
    {
      agent: "Dobby",
      id: row.id,
      status: "done",
    },
    { conversationId: "conv-parent" },
  );
  expect(allowed.status).toBe(200);
  await saveActivities(vfs, callerRoot, [PARENT, row]);
  const own = await call(
    "POST",
    "/sandbox/missions/status",
    {
      id: row.id,
      status: "done",
    },
    { conversationId: "conv-parent" },
  );
  expect(own.status).toBe(200);
});

test("a fronted regular agent needs an acting person for other pods", async () => {
  stubGateway([], { "/agents": [{ id: "other", name: "Other" }] });
  const result = await call("GET", "/sandbox/missions", undefined, {
    gatewayFronted: true,
    actingAs: "",
    search: "?agent=Other",
  });
  expect(result.body).toMatchObject({ code: "no_acting_person" });
});

test("a named agent gets the mission on ITS board, started like a UI mission", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Dobby",
      title: "Roast the website",
      prompt: "Review houston.ai and roast the copy.",
      mode: "auto",
    },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);

  const created = (await boardOf(targetRoot))[0];
  expect(created?.title).toBe("Roast the website");
  expect(created?.status).toBe("running");
  expect(created?.description).toBe("Review houston.ai and roast the copy.");
  expect(created?.origin_session_key).toBe("conv-parent");
  expect(await boardOf(callerRoot)).toEqual([PARENT]);

  expect(fired).toEqual([
    {
      agentId: target.id,
      cid: `activity-${created?.id}`,
      text: "Review houston.ai and roast the copy.",
      pin: { mode: "auto" },
    },
  ]);
  expect(events).toContainEqual({
    type: "ActivityChanged",
    agentPath: target.id,
  });
  expect(events).not.toContainEqual({
    type: "ActivityChanged",
    agentPath: caller.id,
  });
});

test("a cross-agent pin reaches the TARGET's first turn, not just its board row", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Dobby",
      title: "Roast the website",
      prompt: "Roast it.",
      provider: "openai-codex",
      model: "gpt-5.5",
    },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  const created = (await boardOf(targetRoot))[0];
  expect(created?.provider).toBe("openai-codex");
  expect(created?.model).toBe("gpt-5.5");
  expect(fired[0]?.agentId).toBe(target.id);
  expect(fired[0]?.pin).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.5",
  });
});

test("resolution is fail-closed: unknown, hidden and other users' agents", async () => {
  const unknown = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Kreacher", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(unknown.status).toBe(404);
  expect(String((unknown.body as { error: string }).error)).toContain("Dobby");

  const hidden = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: ".assistant", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(hidden.status).toBe(404);

  const foreign = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: otherUsersAgent.id, title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(foreign.status).toBe(404);
  expect(fired).toEqual([]);
});

test("an agent id resolves as well as a name", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: target.id, title: "By id", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  expect((await boardOf(targetRoot))[0]?.title).toBe("By id");
});

test("the depth guard reads the caller's board, the cap counts the target's", async () => {
  await saveActivities(vfs, callerRoot, [
    { ...PARENT, origin_session_key: "conv-grandparent" },
  ]);
  const depth = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(depth.status).toBe(409);
  expect(await boardOf(targetRoot)).toEqual([]);

  await saveActivities(vfs, callerRoot, [PARENT]);
  await saveActivities(
    vfs,
    targetRoot,
    Array.from({ length: 20 }, (_, i) => ({
      id: `r-${i}`,
      title: `m${i}`,
      description: "",
      status: "running" as const,
    })),
  );
  const cap = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(cap.status).toBe(409);
  expect(fired).toEqual([]);
});

test("list, status and read all act on the named agent's board", async () => {
  await saveActivities(vfs, targetRoot, [
    {
      id: "m-1",
      title: "Roast the website",
      description: "",
      status: "needs_you",
      origin_session_key: "conv-parent",
      origin_agent: caller.id,
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  ]);

  const listed = await call("GET", "/sandbox/missions", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Dobby",
  });
  expect(listed.status).toBe(200);
  expect((listed.body as { missions: { id: string }[] }).missions).toHaveLength(
    1,
  );
  const own = await call("GET", "/sandbox/missions", undefined, {
    conversationId: "conv-parent",
  });
  expect((own.body as { missions: { id: string }[] }).missions[0]?.id).toBe(
    "parent-1",
  );

  await vfs.writeText(
    conversationKey(paths, ws, target, "activity-m-1"),
    JSON.stringify({
      id: "activity-m-1",
      title: "Roast the website",
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { role: "user", content: "Roast it", ts: 1 },
        { role: "assistant", content: "Here is the roast", ts: 2 },
      ],
    }),
  );
  const read = await call("GET", "/sandbox/missions/read", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Dobby&id=m-1",
  });
  expect(read.status).toBe(200);
  const transcript = read.body as {
    title: string;
    messages: { role: string; content: string }[];
    totalMessages: number;
  };
  expect(transcript.title).toBe("Roast the website");
  expect(transcript.totalMessages).toBe(2);
  expect(transcript.messages.at(-1)?.content).toBe("Here is the roast");

  const moved = await call(
    "POST",
    "/sandbox/missions/status",
    { agent: "Dobby", id: "m-1", status: "done" },
    { conversationId: "conv-parent" },
  );
  expect(moved.status).toBe(200);
  expect((await boardOf(targetRoot))[0]?.status).toBe("done");
});

test("read answers 404 for a mission that has no transcript yet", async () => {
  const r = await call("GET", "/sandbox/missions/read", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Dobby&id=nope",
  });
  expect(r.status).toBe(404);
});

test("a running mission with no transcript reports its status to another agent", async () => {
  await saveActivities(vfs, targetRoot, [
    {
      id: "quiet",
      title: "Quiet work",
      description: "",
      status: "running",
    },
  ]);
  const read = await call("GET", "/sandbox/missions/read", undefined, {
    search: "?agent=Dobby&id=quiet",
  });
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({
    id: "quiet",
    status: "running",
    totalMessages: 0,
    messages: [],
  });
});

test("a regular agent cannot reach another workspace, even when its owner can", async () => {
  const { store: ambiguous, agent: teamDobby } = withSecondDobby();
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent", store: ambiguous },
  );
  expect(r.status).toBe(201);
  expect(fired[0]?.agentId).toBe(target.id);
  const other = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Team/Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent", store: ambiguous },
  );
  expect(other.status).toBe(404);
  expect(fired.some((turn) => turn.agentId === teamDobby.id)).toBe(false);
});

test("the manager retains cross-workspace reach and ignores agent policy", async () => {
  const { store: wider, agent: teamDobby } = withSecondDobby();
  await writeAgentDelegation(vfs, ws.id, caller.id, {
    mode: "off",
    agents: [],
    acceptsMissions: true,
  });
  vi.stubEnv("HOUSTON_MANAGED_CLOUD", "1");
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const result = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Team/Dobby",
      title: "t",
      prompt: "p",
    },
    { conversationId: "conv-parent", store: wider },
  );
  expect(result.status).toBe(201);
  expect(fired[0]?.agentId).toBe(teamDobby.id);
});

test("a delegated mission's first turn retains the verified acting person", async () => {
  stubGateway([], { "/agents": [] });
  const result = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Dobby",
      title: "t",
      prompt: "p",
    },
    { conversationId: "conv-parent", gatewayFronted: true },
  );
  expect(result.status).toBe(201);
  expect(fired[0]?.actingAs).toBe("acting-v1.test");
});

test("a delegated live turn cannot start another agent's mission locally or remotely", async () => {
  await saveActivities(vfs, callerRoot, []);
  const actingAs = `acting-v1.${Buffer.from(JSON.stringify({ sub: "person", dlg: "delegator" })).toString("base64url")}.sig`;
  const local = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: target.name, title: "child", prompt: "p" },
    { conversationId: "conv-parent", gatewayFronted: true, actingAs },
  );
  expect(local.status).toBe(409);
  expect(local.body).toMatchObject({ code: "mission_depth" });
  expect(await boardOf(targetRoot)).toEqual([]);

  const calls: { url: string; init: RequestInit | undefined }[] = [];
  stubGateway(calls, {
    "/agents": [{ id: "slug-remote", name: "Remote", workspaceId: "Houston" }],
    "/agents/slug-remote/missions/start": { id: "escaped", status: "running" },
  });
  const remote = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Remote", title: "child", prompt: "p" },
    { conversationId: "conv-parent", gatewayFronted: true, actingAs },
  );
  expect(remote.status).toBe(409);
  expect(remote.body).toMatchObject({ code: "mission_depth" });
  expect(calls.some((entry) => entry.url.endsWith("/missions/start"))).toBe(
    false,
  );
});

test("in managed cloud the gateway's agents are reachable targets", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  stubGateway(calls, {
    "/agents": [
      { id: "slug-kreacher", name: "Kreacher", workspaceId: "Houston" },
    ],
    "/agents/slug-kreacher/missions/start": {
      id: "m-9",
      title: "Roast the website",
      status: "running",
    },
  });

  const r = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Kreacher",
      title: "Roast the website",
      prompt: "Roast it.",
      mode: "auto",
    },
    { conversationId: "conv-parent", gatewayFronted: true },
  );
  expect(r.status).toBe(201);
  expect(r.body).toEqual({
    id: "m-9",
    title: "Roast the website",
    status: "running",
  });
  const started = calls.find((c) => c.url.includes("/missions/start"));
  expect(started?.url).toBe(
    "https://gw.test/agents/slug-kreacher/missions/start",
  );
  expect(started?.init?.headers).toMatchObject({
    Authorization: `Bearer ${"a".repeat(64)}`,
    "x-houston-acting-as": "acting-v1.test",
  });
  expect(JSON.parse(String(started?.init?.body))).toEqual({
    title: "Roast the website",
    prompt: "Roast it.",
    mode: "auto",
    origin: { session_key: "conv-parent", agent: caller.id, depth: 1 },
  });
  expect(await boardOf(targetRoot)).toEqual([]);
  expect(fired).toEqual([]);
});

test("checking on a mission follows it into the agent's own pod", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  stubGateway(calls, {
    "/agents": [
      { id: "slug-kreacher", name: "Kreacher", workspaceId: "Houston" },
    ],
    "/agents/slug-kreacher/missions": {
      missions: [
        { id: "m-9", title: "Roast the website", status: "needs_you" },
      ],
    },
    "/agents/slug-kreacher/missions/read": {
      id: "m-9",
      title: "Roast the website",
      totalMessages: 2,
      messages: [{ role: "assistant", content: "Here is the roast" }],
    },
  });

  const listed = await call("GET", "/sandbox/missions", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Kreacher",
    gatewayFronted: true,
  });
  expect(listed.status).toBe(200);
  expect((listed.body as { missions: { id: string }[] }).missions[0]?.id).toBe(
    "m-9",
  );

  const read = await call("GET", "/sandbox/missions/read", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Kreacher&id=m-9&limit=5",
    gatewayFronted: true,
  });
  expect(read.status).toBe(200);
  expect(
    (read.body as { messages: { content: string }[] }).messages[0]?.content,
  ).toBe("Here is the roast");
  expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
    "/agents",
    "/agents/slug-kreacher/missions",
    "/agents",
    "/agents/slug-kreacher/missions/read",
  ]);
});

test("a gateway that cannot answer is an error, never a missing agent", async () => {
  stubGateway([], {});
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Kreacher", title: "t", prompt: "p" },
    { conversationId: "conv-parent", gatewayFronted: true },
  );
  expect(r.status).toBe(502);
  expect((r.body as { code: string }).code).toBe("agents_unreadable");
});

test("moving a mission on an agent in its own pod follows it there", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  stubGateway(calls, {
    "/agents": [
      { id: "slug-kreacher", name: "Kreacher", workspaceId: "Houston" },
    ],
    "/agents/slug-kreacher/missions/status": { id: "m-9", status: "done" },
  });
  const r = await call(
    "POST",
    "/sandbox/missions/status",
    { agent: "Kreacher", id: "m-9", status: "done" },
    { conversationId: "conv-parent", gatewayFronted: true },
  );
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ id: "m-9", status: "done" });
  const moved = calls.find((c) => c.url.includes("/missions/status"));
  expect(moved?.url).toBe(
    "https://gw.test/agents/slug-kreacher/missions/status",
  );
  expect(JSON.parse(String(moved?.init?.body))).toEqual({
    id: "m-9",
    status: "done",
  });
});

test("a move with no mission id is refused before any agent is resolved", async () => {
  stubGateway([], {});
  const r = await call(
    "POST",
    "/sandbox/missions/status",
    { agent: "Kreacher", status: "done" },
    { conversationId: "conv-parent", gatewayFronted: true },
  );
  expect(r.status).toBe(400);
  expect((r.body as { code: string }).code).toBe("invalid_mission");
});

test("the caller's budget is spent across every board, not per board", async () => {
  for (let i = 0; i < 20; i++)
    missionFanout.record(caller.id, {
      missionId: `remote-${i}`,
      boardRoot: null,
    });
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ code: "mission_fanout" });
  expect(await boardOf(targetRoot)).toEqual([]);
  expect(fired).toEqual([]);
});

test("21 concurrent remote starts reserve only 20 caller slots", async () => {
  stubGateway([], {
    "/agents": [{ id: "slug-remote", name: "Remote", workspaceId: "Houston" }],
    "/agents/slug-remote/missions/start": { id: "started", status: "running" },
  });
  const gatewayFetch = globalThis.fetch;
  let startsAtBoundary = 0;
  let releaseStarts: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseStarts = resolve;
  });
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (new URL(String(input)).pathname.endsWith("/missions/start")) {
      startsAtBoundary++;
      if (startsAtBoundary === 20) releaseStarts?.();
      await held;
    }
    return gatewayFetch(input, init);
  }) as typeof fetch;
  const starts = Array.from({ length: 21 }, (_, index) =>
    call(
      "POST",
      "/sandbox/missions/start",
      {
        agent: "Remote",
        title: `mission-${index}`,
        prompt: "p",
      },
      { conversationId: "conv-parent", gatewayFronted: true },
    ),
  );
  const results = await Promise.all(starts);
  expect(results.filter((result) => result.status === 201)).toHaveLength(20);
  expect(
    results.filter(
      (result) =>
        result.status === 409 &&
        (result.body as { code?: string })?.code === "mission_fanout",
    ),
  ).toHaveLength(1);
});

test("a refused remote start returns its caller reservation", async () => {
  stubGateway([], {
    "/agents": [{ id: "slug-remote", name: "Remote", workspaceId: "Houston" }],
    "/agents/slug-remote/missions/start": { id: "started", status: "running" },
  });
  const gatewayFetch = globalThis.fetch;
  let refuseFirst = true;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (
      new URL(String(input)).pathname.endsWith("/missions/start") &&
      refuseFirst
    ) {
      refuseFirst = false;
      return new Response(JSON.stringify({ error: "refused" }), {
        status: 409,
      });
    }
    return gatewayFetch(input, init);
  }) as typeof fetch;
  const input = { agent: "Remote", title: "t", prompt: "p" };
  const opts = { conversationId: "conv-parent", gatewayFronted: true };
  expect(
    (await call("POST", "/sandbox/missions/start", input, opts)).status,
  ).toBe(409);
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      call("POST", "/sandbox/missions/start", input, opts),
    ),
  );
  expect(results.filter((result) => result.status === 201)).toHaveLength(20);
});

test("a cross-pod start carries the depth it was counted at", async () => {
  await saveActivities(vfs, callerRoot, [
    { ...PARENT, origin_session_key: "conv-grandparent", origin_depth: 1 },
  ]);
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  stubGateway(calls, {
    "/agents": [
      { id: "slug-kreacher", name: "Kreacher", workspaceId: "Houston" },
    ],
  });
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Kreacher", title: "t", prompt: "p" },
    { conversationId: "conv-parent", gatewayFronted: true },
  );
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({
    code: "mission_depth",
    error:
      "a mission started by another mission can't start further missions - ask in the original chat instead",
  });
  expect(calls.find((c) => c.url.includes("/missions/start"))).toBeUndefined();
});
