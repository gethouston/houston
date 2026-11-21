import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createRoutine, saveActivities, saveRoutines } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import { afterEach, expect, test, vi } from "vitest";
import { ApprovalStore } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { MemoryVfs } from "../vfs";
import {
  ASSISTANT_CALL_PATH,
  ASSISTANT_PENDING_PATH,
  handleSandboxAssistant,
} from "./assistant-sandbox";
import { liveTurns } from "./live-turn";

const CATALOG: AssistantCatalog = {
  version: 3,
  sourceHash: "fixture",
  operations: [
    {
      name: "createAgent",
      group: "agents",
      description: "Creates an agent.",
      confirm: true,
      hidden: false,
      params: [
        { name: "name", required: true, schema: { type: "string" } },
        { name: "color", required: false, schema: { type: "string" } },
        { name: "seed", required: false, schema: { type: "object" } },
      ],
      returns: { type: "object" },
      route: {
        method: "POST",
        path: "/agents",
        pathParams: [],
        query: {},
        body: null,
        bodyFields: {
          name: "name",
          color: "color",
          claudeMd: "seed.claudeMd",
          seeds: "seed.seeds",
        },
      },
    },
    {
      name: "listOrgs",
      group: "org",
      description: "The spaces the caller belongs to.",
      confirm: false,
      hidden: false,
      params: [],
      returns: { type: "array" },
      route: {
        method: "GET",
        path: "/v1/orgs",
        pathParams: [],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "listRoutines",
      group: "routines",
      description: "List an agent's routines.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentPath",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
        },
        { name: "limit", required: false, schema: { type: "number" } },
      ],
      returns: { type: "array" },
      route: {
        method: "GET",
        path: "/v1/routines",
        pathParams: [],
        query: { agentPath: "agentPath", limit: "limit" },
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "remindOrgMember",
      group: "org",
      description: "Nudge a person in the space.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "member",
          required: true,
          schema: { type: "string" },
          resolver: "members",
        },
      ],
      returns: { type: "object" },
      route: {
        method: "POST",
        path: "/v1/org/remind",
        pathParams: [],
        query: { member: "member" },
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "createRoutine",
      group: "routines",
      description: "Schedule recurring work.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentPath",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
        },
        { name: "input", required: true, schema: { type: "object" } },
      ],
      returns: { type: "object" },
      route: {
        method: "POST",
        path: "/v1/routines",
        pathParams: [],
        query: { agentPath: "agentPath" },
        body: "input",
        bodyFields: null,
      },
    },
    {
      name: "updateRoutine",
      group: "routines",
      description: "Change a routine.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentPath",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
        },
        {
          name: "id",
          required: true,
          schema: { type: "string" },
          resolver: "routines",
        },
        { name: "updates", required: true, schema: { type: "object" } },
      ],
      returns: { type: "object" },
      route: {
        method: "PATCH",
        path: "/v1/routines/{id}",
        pathParams: [{ name: "id", encoding: "segment" }],
        query: { agentPath: "agentPath" },
        body: "updates",
        bodyFields: null,
      },
    },
    {
      name: "deleteRoutine",
      group: "routines",
      description: "Delete a routine for good.",
      confirm: true,
      hidden: false,
      params: [
        {
          name: "agentPath",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
        },
        {
          name: "id",
          required: true,
          schema: { type: "string" },
          resolver: "routines",
        },
      ],
      returns: { type: "null" },
      route: {
        method: "DELETE",
        path: "/v1/routines/{id}",
        pathParams: [{ name: "id", encoding: "segment" }],
        query: { agentPath: "agentPath" },
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "addOrgMember",
      group: "org",
      description: "Invite somebody to the space.",
      confirm: true,
      hidden: false,
      params: [
        { name: "email", required: true, schema: { type: "string" } },
        { name: "role", required: false, schema: { type: "string" } },
      ],
      returns: { type: "object" },
      route: {
        method: "POST",
        path: "/v1/org/members",
        pathParams: [],
        query: {},
        body: null,
        bodyFields: { email: "email", role: "role" },
      },
    },
    {
      name: "readAgentFile",
      group: "files",
      description: "Read one file inside an agent, by its relative path.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentId",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
        },
        { name: "relPath", required: true, schema: { type: "string" } },
      ],
      returns: { type: "object" },
      route: {
        method: "GET",
        path: "/agents/{agentId}/agentfile/{relPath}",
        pathParams: [
          { name: "agentId", encoding: "segment" },
          { name: "relPath", encoding: "path" },
        ],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "rotateEngineSecret",
      group: "internal",
      description: "Withheld from the agent entirely.",
      confirm: true,
      hidden: true,
      params: [],
      returns: { type: "null" },
      route: {
        method: "POST",
        path: "/v1/internal/rotate",
        pathParams: [],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "deleteAgent",
      group: "agents",
      description: "Delete an agent and everything in it.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "id",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
        },
      ],
      returns: { type: "null" },
      route: {
        method: "DELETE",
        path: "/agents/{id}",
        pathParams: [{ name: "id", encoding: "segment" }],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "conversations.rename",
      group: "chat",
      description: "Retitle one of an agent's chats.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentId",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
          source: "listAgents",
        },
        {
          name: "id",
          required: true,
          schema: { type: "string" },
          source: "conversations.list",
        },
        { name: "title", required: true, schema: { type: "string" } },
      ],
      returns: { type: "object" },
      route: {
        method: "PATCH",
        path: "/agents/{agentId}/conversations/{id}",
        pathParams: [
          { name: "agentId", encoding: "segment" },
          { name: "id", encoding: "segment" },
        ],
        query: {},
        body: null,
        bodyFields: { title: "title" },
      },
    },
    {
      name: "conversations.delete",
      group: "chat",
      description: "Delete one of an agent's chats.",
      confirm: true,
      hidden: false,
      params: [
        {
          name: "agentId",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
          source: "listAgents",
        },
        {
          name: "id",
          required: true,
          schema: { type: "string" },
          source: "conversations.list",
        },
      ],
      returns: { type: "object" },
      route: {
        method: "DELETE",
        path: "/agents/{agentId}/conversations/{id}",
        pathParams: [
          { name: "agentId", encoding: "segment" },
          { name: "id", encoding: "segment" },
        ],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "turns.cancel",
      group: "chat",
      description: "Stop the turn running in a chat.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentId",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
          source: "listAgents",
        },
        {
          name: "conversationId",
          required: true,
          schema: { type: "string" },
          source: "conversations.list",
        },
      ],
      returns: { type: "object" },
      route: {
        method: "POST",
        path: "/agents/{agentId}/conversations/{conversationId}/cancel",
        pathParams: [
          { name: "agentId", encoding: "segment" },
          { name: "conversationId", encoding: "segment" },
        ],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "turns.history",
      group: "chat",
      description: "Read what was said in a chat.",
      confirm: false,
      hidden: false,
      params: [
        {
          name: "agentId",
          required: true,
          schema: { type: "string" },
          resolver: "agents",
          source: "listAgents",
        },
        {
          name: "conversationId",
          required: true,
          schema: { type: "string" },
          source: "conversations.list",
        },
      ],
      returns: { type: "array" },
      route: {
        method: "GET",
        path: "/agents/{agentId}/conversations/{conversationId}/messages",
        pathParams: [
          { name: "agentId", encoding: "segment" },
          { name: "conversationId", encoding: "segment" },
        ],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "downloadAgentFile",
      group: "files",
      description: "Catalogued, but no route could be derived from its source.",
      confirm: false,
      hidden: false,
      params: [],
      returns: { type: "object" },
      route: null,
    },
  ],
};

const ASSISTANT_AGENT = "w1/.assistant";

const WORKSPACE: Workspace = {
  id: "w1",
  ownerUserId: "u1",
  kind: "personal",
  name: "Work",
  slug: "work",
  runtime: "local",
  createdAt: 0,
};
const AGENTS: Agent[] = [
  { id: "Work/Ada", workspaceId: WORKSPACE.id, name: "Ada", createdAt: 0 },
  { id: "Work/Dobby", workspaceId: WORKSPACE.id, name: "Dobby", createdAt: 0 },
  {
    id: ASSISTANT_AGENT,
    workspaceId: WORKSPACE.id,
    name: ".assistant",
    createdAt: 0,
  },
];
const store = {
  getWorkspace: async (id: string) => (id === WORKSPACE.id ? WORKSPACE : null),
  listWorkspacesForUser: async () => [WORKSPACE],
  listAgents: async () => AGENTS,
} as unknown as WorkspaceStore;

const vault: CredentialVault = {
  sandboxToken: () => "sbx",
  validateSandboxToken: (t) =>
    t === "sbx"
      ? { workspaceId: WORKSPACE.id, agentId: ASSISTANT_AGENT }
      : t === "sbx-sales"
        ? { workspaceId: WORKSPACE.id, agentId: "w1/Sales" }
        : null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  liveTurns.forget(ASSISTANT_AGENT);
});

const GATEWAY = { url: "https://gateway.test", token: "gw-token" };

function mockReq(
  body: unknown,
  opts: {
    token?: string;
    actingAs?: string;
    conversationId?: string | null;
  } = {},
): IncomingMessage {
  const req = Readable.from([
    Buffer.from(body === undefined ? "" : JSON.stringify(body)),
  ]) as unknown as IncomingMessage;
  const conversationId =
    opts.conversationId === null
      ? undefined
      : (opts.conversationId ?? "conv-1");
  req.headers = {
    authorization: `Bearer ${opts.token ?? "sbx"}`,
    ...(conversationId ? { "x-houston-conversation-id": conversationId } : {}),
    ...(opts.actingAs ? { "x-houston-acting-as": opts.actingAs } : {}),
  };
  return req;
}

function mockRes() {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(buf?: Buffer | string) {
      const text = buf?.toString() ?? "";
      out.body = text ? JSON.parse(text) : undefined;
    },
  } as unknown as ServerResponse;
  return { res, out };
}

interface Captured {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
}

function fetchStub(
  reply: () => { status?: number; body?: unknown; raw?: string },
) {
  const calls: Captured[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = reply();
    const payload =
      r.raw ?? (r.body === undefined ? null : JSON.stringify(r.body));
    return new Response(payload, { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, impl };
}

function sent(calls: Captured[]): Captured {
  const [first] = calls;
  if (!first) throw new Error("no request reached the gateway");
  return first;
}

interface CallOpts {
  token?: string;
  actingAs?: string;
  conversationId?: string | null;
  gateway?: typeof GATEWAY | null;
  catalog?: AssistantCatalog | null;
  fetchImpl?: typeof fetch;
  method?: string;
  path?: string;
  gatewayFronted?: boolean;
  approvals?: ApprovalStore;
  noLiveTurn?: boolean;
  unserved?: string[];
  activities?: Activity[];
}

async function call(body: unknown, opts: CallOpts = {}) {
  const claimed =
    opts.conversationId === null
      ? undefined
      : (opts.conversationId ?? "conv-1");
  if (claimed && !opts.noLiveTurn && !liveTurns.get(ASSISTANT_AGENT, claimed))
    liveTurns.start(ASSISTANT_AGENT, claimed, "execute");
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  for (const agent of AGENTS) {
    if (opts.activities)
      await saveActivities(vfs, paths.agentRoot(WORKSPACE, agent), [
        ...opts.activities,
      ]);
    await saveRoutines(
      vfs,
      paths.agentRoot(WORKSPACE, agent),
      ["r1", "r2", "r 1-x"].map((id) =>
        createRoutine(
          { name: id, prompt: "p", schedule: "0 9 * * *" },
          id,
          "2026-01-01",
        ),
      ),
    );
  }
  const out = mockRes();
  const path = opts.path ?? ASSISTANT_CALL_PATH;
  const handled = await handleSandboxAssistant(
    {
      vault,
      store,
      vfs,
      paths,
      fetchImpl: opts.fetchImpl,
      gatewayFronted: opts.gatewayFronted,
      approvals: opts.approvals ?? new ApprovalStore(),
      assistantGateway: () =>
        opts.gateway === undefined ? GATEWAY : opts.gateway,
      assistantCatalog: () =>
        opts.catalog === undefined ? CATALOG : opts.catalog,
      unservedOperations: () => new Set(opts.unserved ?? []),
    },
    opts.method ?? "POST",
    path,
    new URL(`http://host${path}`),
    mockReq(body, opts),
    out.res,
  );
  return { handled, ...out.out };
}

async function approvedCall(
  operation: string,
  params: Record<string, unknown>,
  opts: CallOpts = {},
) {
  const approvals = opts.approvals ?? new ApprovalStore();
  const conversationId =
    opts.conversationId === null ? "conv-1" : (opts.conversationId ?? "conv-1");
  const request = approvals.issue({
    operation,
    params,
    agentId: ASSISTANT_AGENT,
    conversationId,
    summary: "s",
  });
  approvals.decide({
    requestId: request.requestId,
    agentId: ASSISTANT_AGENT,
    conversationId,
    decision: "approve",
  });
  return call(
    { operation, params, requestId: request.requestId },
    { ...opts, approvals },
  );
}

test("a request for another path is not this route's", async () => {
  const out = mockRes();
  await expect(
    handleSandboxAssistant(
      { vault, store },
      "POST",
      "/sandbox/missions",
      new URL("http://host/sandbox/missions"),
      mockReq({}),
      out.res,
    ),
  ).resolves.toBe(false);
});

test("a bad sandbox token is rejected before anything else happens", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { token: "not-the-token", fetchImpl: impl },
  );
  expect(out.handled).toBe(true);
  expect(out.status).toBe(401);
  expect(out.body).toEqual({ error: "unauthorized", code: "unauthorized" });
  expect(calls).toHaveLength(0);
});

test("an unconfigured deployment answers 501 with a named code", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { gateway: null, fetchImpl: impl },
  );
  expect(out.status).toBe(501);
  expect(out.body).toMatchObject({ code: "assistant_not_configured" });
  expect(String((out.body as { error: string }).error)).toContain(
    "HOUSTON_ASSISTANT_CP_URL",
  );
  expect(calls).toHaveLength(0);
});

test("an operation this host does not route is refused, never forwarded", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "deleteEverything", params: {} },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
  expect(calls).toHaveLength(0);
});

test.each([
  ["an absent operation", {}],
  ["a non-string operation", { operation: 42 }],
  ["an inherited property name", { operation: "constructor" }],
  ["an Object prototype key", { operation: "toString" }],
])("%s is refused as unsupported", async (_label, body) => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(body, { fetchImpl: impl });
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
  expect(calls).toHaveLength(0);
});

test("a routed read reaches the gateway under the GATEWAY's bearer token", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { orgs: [] } }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    {
      fetchImpl: impl,
    },
  );

  expect(calls).toHaveLength(1);
  expect(sent(calls).url).toBe("https://gateway.test/v1/orgs");
  expect(sent(calls).method).toBe("GET");
  expect(sent(calls).headers.Authorization).toBe("Bearer gw-token");
  expect(out.status).toBe(200);
  expect(out.body).toEqual({ orgs: [] });
});

test("the caller's acting identity is relayed so the gateway authorizes the person", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { orgs: [] } }));
  await call(
    { operation: "listOrgs", params: {} },
    {
      fetchImpl: impl,
      actingAs: "acting-token",
    },
  );
  expect(sent(calls).headers["x-houston-acting-as"]).toBe("acting-token");
});

test("no acting header is invented when the caller sent none", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { orgs: [] } }));
  await call({ operation: "listOrgs", params: {} }, { fetchImpl: impl });
  expect(sent(calls).headers["x-houston-acting-as"]).toBeUndefined();
});

test("named arguments become the gateway's path, query and body", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { id: "r1" } }));
  await call(
    {
      operation: "updateRoutine",
      params: {
        agentPath: "Work/Ada",
        id: "r 1-x",
        updates: { cron: "0 9 * * *" },
      },
    },
    { fetchImpl: impl },
  );
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines/r%201-x?agentPath=Work%2FAda",
  );
  expect(sent(calls).method).toBe("PATCH");
  expect(sent(calls).body).toEqual({ cron: "0 9 * * *" });
});

test("an argument that does not fit the operation is a 400, not a forward", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "listRoutines", params: { agentPath: 42 } },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "invalid_params" });
  expect(calls).toHaveLength(0);
});

test("a query key whose parameter was omitted is left off the URL", async () => {
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  await call(
    { operation: "listRoutines", params: { agentPath: "Work/Ada" } },
    { fetchImpl: impl },
  );
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines?agentPath=Work%2FAda",
  );
});

test("an optional query parameter that was given does reach the URL", async () => {
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  await call(
    { operation: "listRoutines", params: { agentPath: "Work/Ada", limit: 5 } },
    { fetchImpl: impl },
  );
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines?agentPath=Work%2FAda&limit=5",
  );
});

test("a whole-parameter body is forwarded as the gateway's JSON body", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { id: "r1" } }));
  await call(
    {
      operation: "createRoutine",
      params: { agentPath: "Work/Ada", input: { cron: "0 9 * * *" } },
    },
    { fetchImpl: impl },
  );
  expect(sent(calls).method).toBe("POST");
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines?agentPath=Work%2FAda",
  );
  expect(sent(calls).body).toEqual({ cron: "0 9 * * *" });
  expect(sent(calls).headers["Content-Type"]).toBe("application/json");
});

test("a field-mapped body is assembled from its named parameters", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { invited: true } }));
  await approvedCall(
    "addOrgMember",
    { email: "ada@example.com", role: "member" },
    { fetchImpl: impl },
  );
  expect(sent(calls).url).toBe("https://gateway.test/v1/org/members");
  expect(sent(calls).body).toEqual({
    email: "ada@example.com",
    role: "member",
  });
});

test("an omitted optional body field is left out of the body", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { invited: true } }));
  await approvedCall(
    "addOrgMember",
    { email: "ada@example.com" },
    { fetchImpl: impl },
  );
  expect(sent(calls).body).toEqual({ email: "ada@example.com" });
});

test("a path placeholder is substituted and percent-escaped", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  await approvedCall(
    "deleteRoutine",
    { agentPath: "Work/Ada", id: "r 1-x" },
    { fetchImpl: impl },
  );
  expect(sent(calls).method).toBe("DELETE");
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines/r%201-x?agentPath=Work%2FAda",
  );
});

test("a path-encoded parameter keeps its separators while escaping each segment", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { content: "{}" } }));
  await call(
    {
      operation: "readAgentFile",
      params: { agentId: "Work/Ada", relPath: "board/activity one.json" },
    },
    { fetchImpl: impl },
  );
  expect(sent(calls).url).toBe(
    "https://gateway.test/agents/Work%2FAda/agentfile/board/activity%20one.json",
  );
});

test("a missing path parameter is a 400, never a request to a mangled URL", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada" } },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "invalid_params" });
  expect(calls).toHaveLength(0);
});

test("a hidden operation is refused exactly like an unknown one", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "rotateEngineSecret", params: {} },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
  expect(calls).toHaveLength(0);
});

test("a catalogued operation with no derivable route is refused", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "downloadAgentFile", params: {} },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
  expect(calls).toHaveLength(0);
});

test("a configured host with no catalog answers 503, not a forwarded guess", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { catalog: null, fetchImpl: impl },
  );
  expect(out.status).toBe(503);
  expect(out.body).toMatchObject({ code: "assistant_catalog_unavailable" });
  expect(calls).toHaveLength(0);
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});

test("a gateway refusal is passed through with its status, never swallowed", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const { impl } = fetchStub(() => ({ status: 403, body: { error: "nope" } }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    {
      fetchImpl: impl,
    },
  );
  expect(out.status).toBe(403);
  expect(out.body).toMatchObject({ code: "gateway_error" });
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});

test("an unreachable gateway is a 502 that says so", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const impl = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  const out = await call(
    { operation: "listOrgs", params: {} },
    {
      fetchImpl: impl,
    },
  );
  expect(out.status).toBe(502);
  expect(out.body).toMatchObject({ code: "gateway_unreachable" });
  err.mockRestore();
});

test("a non-JSON 2xx becomes a 502 rather than a success", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const { impl } = fetchStub(() => ({ raw: "<html>proxy</html>" }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    {
      fetchImpl: impl,
    },
  );
  expect(out.status).toBe(502);
  expect(out.body).toMatchObject({ code: "gateway_error" });
  err.mockRestore();
});

test("a non-POST on the route is rejected", async () => {
  const out = await call({}, { method: "GET" });
  expect(out.status).toBe(405);
});

test("another agent's sandbox token is refused, even though it is valid", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { token: "sbx-sales", fetchImpl: impl },
  );
  expect(out.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("another agent cannot raise an approval request either", async () => {
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada", id: "r1" } },
    { token: "sbx-sales", path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(401);
});

test("on a gateway-fronted pod the pod's own agent is the assistant", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { token: "sbx-sales", fetchImpl: impl, gatewayFronted: true },
  );
  expect(out.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("a confirm operation with no receipt is refused, and nothing is forwarded", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada", id: "r1" } },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(403);
  expect(out.body).toMatchObject({ code: "approval_required" });
  expect(calls).toHaveLength(0);
});

test("an invented requestId is refused exactly like none at all", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    {
      operation: "deleteRoutine",
      params: { agentPath: "Work/Ada", id: "r1" },
      requestId: "made-up",
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(403);
  expect(out.body).toMatchObject({ code: "approval_required" });
  expect(calls).toHaveLength(0);
});

test("an approved receipt lets the call through and answers the gateway's reply", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await approvedCall(
    "deleteRoutine",
    { agentPath: "Work/Ada", id: "r1" },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("a receipt is spent once: the identical call after it is refused", async () => {
  const approvals = new ApprovalStore();
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const params = { agentPath: "Work/Ada", id: "r1" };
  const request = approvals.issue({
    operation: "deleteRoutine",
    params,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    summary: "s",
  });
  approvals.decide({
    requestId: request.requestId,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    decision: "approve",
  });
  const body = {
    operation: "deleteRoutine",
    params,
    requestId: request.requestId,
  };
  expect((await call(body, { approvals, fetchImpl: impl })).status).toBe(200);
  const replay = await call(body, { approvals, fetchImpl: impl });
  expect(replay.status).toBe(403);
  expect(replay.body).toMatchObject({ code: "approval_required" });
  expect(calls).toHaveLength(1);
});

test("a receipt minted for other params does not authorize these", async () => {
  const approvals = new ApprovalStore();
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const request = approvals.issue({
    operation: "deleteRoutine",
    params: { agentPath: "Work/Ada", id: "r1" },
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    summary: "s",
  });
  approvals.decide({
    requestId: request.requestId,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    decision: "approve",
  });
  const out = await call(
    {
      operation: "deleteRoutine",
      params: { agentPath: "Work/Ada", id: "r2" },
      requestId: request.requestId,
    },
    { approvals, fetchImpl: impl },
  );
  expect(out.status).toBe(403);
  expect(out.body).toMatchObject({ code: "approval_required" });
  expect(calls).toHaveLength(0);
});

test("a receipt from another conversation authorizes nothing here", async () => {
  const approvals = new ApprovalStore();
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const params = { agentPath: "Work/Ada", id: "r1" };
  const request = approvals.issue({
    operation: "deleteRoutine",
    params,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-other",
    summary: "s",
  });
  approvals.decide({
    requestId: request.requestId,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-other",
    decision: "approve",
  });
  const out = await call(
    { operation: "deleteRoutine", params, requestId: request.requestId },
    { approvals, fetchImpl: impl, conversationId: "conv-1" },
  );
  expect(out.status).toBe(403);
  expect(calls).toHaveLength(0);
});

test("an expired receipt is refused", async () => {
  let now = 1_000;
  const approvals = new ApprovalStore(() => now);
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const params = { agentPath: "Work/Ada", id: "r1" };
  const request = approvals.issue({
    operation: "deleteRoutine",
    params,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    summary: "s",
  });
  approvals.decide({
    requestId: request.requestId,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    decision: "approve",
  });
  now += 10 * 60_000 + 1;
  const out = await call(
    { operation: "deleteRoutine", params, requestId: request.requestId },
    { approvals, fetchImpl: impl },
  );
  expect(out.status).toBe(403);
  expect(calls).toHaveLength(0);
});

test("a denial is reported as a denial, and performs nothing", async () => {
  const approvals = new ApprovalStore();
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const params = { agentPath: "Work/Ada", id: "r1" };
  const request = approvals.issue({
    operation: "deleteRoutine",
    params,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    summary: "s",
  });
  approvals.decide({
    requestId: request.requestId,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    decision: "deny",
  });
  const out = await call(
    { operation: "deleteRoutine", params, requestId: request.requestId },
    { approvals, fetchImpl: impl },
  );
  expect(out.status).toBe(403);
  expect(out.body).toMatchObject({ code: "approval_denied" });
  expect(calls).toHaveLength(0);
});

test("a pending request returns an id and the wording the card will show", async () => {
  const approvals = new ApprovalStore();
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada", id: "r1" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(200);
  const body = out.body as { requestId: string; summary: string };
  expect(body.requestId).toMatch(/^[0-9a-f]{32}$/);
  expect(body.summary).toContain("Delete a routine for good");
  expect(body.summary).toContain("Work/Ada");
  expect(approvals.hasPending(ASSISTANT_AGENT, "conv-1")).toBe(true);
});

test("one constrained hire spends a grant and its receipt in the call gate", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "u1",
    requiresActor: false,
  });
  const params = { name: "Writer", color: "teal", seed: { claudeMd: "Write" } };
  const pending = await call(
    { operation: "createAgent", params },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(pending.body).toMatchObject({ preApproved: true });
  const requestId = (pending.body as { requestId: string }).requestId;
  expect(
    approvals.pending(requestId, ASSISTANT_AGENT, "conv-1"),
  ).toBeUndefined();
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const body = { operation: "createAgent", params, requestId };
  expect((await call(body, { approvals, fetchImpl: impl })).status).toBe(200);
  expect((await call(body, { approvals, fetchImpl: impl })).status).toBe(403);
  expect(calls).toHaveLength(1);
  const second = await call(
    { operation: "createAgent", params: { name: "Researcher" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(second.body).not.toHaveProperty("preApproved");
  const secondId = (second.body as { requestId: string }).requestId;
  expect(approvals.pending(secondId, ASSISTANT_AGENT, "conv-1")).toBeDefined();
});

test("a hire grant leaves other conversations, operations, and file seeds on cards", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "u1",
    requiresActor: false,
  });
  const otherConversation = await call(
    { operation: "createAgent", params: { name: "Writer" } },
    { approvals, conversationId: "conv-2", path: ASSISTANT_PENDING_PATH },
  );
  expect(otherConversation.body).not.toHaveProperty("preApproved");
  const otherOperation = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada", id: "r1" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(otherOperation.body).not.toHaveProperty("preApproved");
  const extraFiles = await call(
    {
      operation: "createAgent",
      params: {
        name: "Writer",
        seed: { claudeMd: "Write", seeds: { "note.md": "x" } },
      },
    },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(extraFiles.body).not.toHaveProperty("preApproved");
  const covered = await call(
    { operation: "createAgent", params: { name: "Writer" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(covered.body).toMatchObject({ preApproved: true });
});

test("an expired hire grant raises a card", async () => {
  let now = 100;
  const approvals = new ApprovalStore(() => now);
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "u1",
    requiresActor: false,
  });
  now += 10 * 60_000;
  const pending = await call(
    { operation: "createAgent", params: { name: "Writer" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(pending.body).not.toHaveProperty("preApproved");
  expect(approvals.hasPending(ASSISTANT_AGENT, "conv-1")).toBe(true);
});

test("a grant from another person's hosted turn raises a card", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "person-a-token",
    requiresActor: true,
  });
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "execute", {
    actingAs: "person-b-token",
  });
  const pending = await call(
    { operation: "createAgent", params: { name: "Writer" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(pending.body).not.toHaveProperty("preApproved");
});

test("an operation that needs no approval cannot raise a card", async () => {
  const out = await call(
    { operation: "listOrgs", params: {} },
    { path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "not_confirmable" });
});

test("a pending request with arguments the operation refuses is a 400", async () => {
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada" } },
    { path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "invalid_params" });
});

test("a pending request with no conversation is refused", async () => {
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada", id: "r1" } },
    { path: ASSISTANT_PENDING_PATH, conversationId: null },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "not_in_turn" });
});

test("a hidden operation cannot be raised for approval either", async () => {
  const out = await call(
    { operation: "rotateEngineSecret", params: {} },
    { path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
});

test("an agent named by the word the user said reaches the gateway as its id", async () => {
  const { calls, impl } = fetchStub(() => ({ body: null }));
  const out = await call(
    { operation: "deleteAgent", params: { id: "Dobby" } },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(calls[0]?.url).toBe("https://gateway.test/agents/Work%2FDobby");
});

test("the qualified spelling resolves too, and an id passes through unchanged", async () => {
  const { calls, impl } = fetchStub(() => ({ body: null }));
  await call(
    { operation: "deleteAgent", params: { id: "Work/Dobby" } },
    { fetchImpl: impl },
  );
  await call(
    { operation: "deleteAgent", params: { id: "Work/Ada" } },
    { fetchImpl: impl },
  );
  expect(calls.map((c) => c.url)).toEqual([
    "https://gateway.test/agents/Work%2FDobby",
    "https://gateway.test/agents/Work%2FAda",
  ]);
});

test("a name nothing matches is refused with the agents that would have, and nothing is forwarded", async () => {
  const { calls, impl } = fetchStub(() => ({ body: null }));
  const out = await call(
    { operation: "deleteAgent", params: { id: "Doby" } },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "unknown_agent" });
  const { error } = out.body as { error: string };
  expect(error).toContain("Dobby (id Work/Dobby, in Work)");
  expect(error).toContain("Ada (id Work/Ada, in Work)");
  expect(error).not.toContain(".assistant");
  expect(calls).toHaveLength(0);
});

test("an approval raised for a spoken name is spent by the call that runs on the id", async () => {
  const approvals = new ApprovalStore();
  const pending = await call(
    { operation: "deleteRoutine", params: { agentPath: "Dobby", id: "r1" } },
    { path: ASSISTANT_PENDING_PATH, approvals },
  );
  expect(pending.status).toBe(200);
  const { requestId, summary } = pending.body as {
    requestId: string;
    summary: string;
  };
  expect(summary).toContain("Work/Dobby");
  approvals.decide({
    requestId,
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    decision: "approve",
  });

  const { calls, impl } = fetchStub(() => ({ body: null }));
  const out = await call(
    {
      operation: "deleteRoutine",
      params: { agentPath: "Dobby", id: "r1" },
      requestId,
    },
    { approvals, fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(calls[0]?.url).toContain("agentPath=Work%2FDobby");
});

test("a hosted operation resolves the real gateway agent slug", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const seen: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    seen.push(String(url));
    return new Response(
      JSON.stringify(
        String(url).endsWith("/agents")
          ? [{ id: "dobby-slug", name: "Dobby", workspaceId: "Houston" }]
          : [],
      ),
    );
  }) as typeof fetch;
  const result = await call(
    {
      operation: "readAgentFile",
      params: { agentId: "Dobby", relPath: "notes.md" },
    },
    { gatewayFronted: true, token: "sbx-sales", fetchImpl },
  );
  expect(result.status).toBe(200);
  expect(seen).toEqual([
    "https://gateway.test/agents",
    "https://gateway.test/agents/dobby-slug/agentfile/notes.md",
  ]);
});

test("a failed hosted directory reports a gateway error without dispatching", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_USER_ID", "owner");
  const fetchImpl = vi.fn<typeof fetch>(async () =>
    Response.json({ error: "unavailable" }, { status: 503 }),
  );
  const result = await call(
    {
      operation: "readAgentFile",
      params: { agentId: "Dobby", relPath: "notes.md" },
    },
    { gatewayFronted: true, token: "sbx-sales", fetchImpl },
  );
  expect(result.status).toBe(502);
  expect(result.body).toMatchObject({ code: "directory_unavailable" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a write is refused while the host's record of this turn says plan", async () => {
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "plan");
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const result = await call(
    {
      operation: "createRoutine",
      params: { agentPath: "w1/Dobby", input: { name: "n" } },
    },
    { fetchImpl: impl, conversationId: "conv-1" },
  );
  expect(result.status).toBe(403);
  expect(result.body).toMatchObject({ code: "plan_mode" });
  expect(calls).toEqual([]);
});

test("a plan turn still reads: a proposal is built out of what is there", async () => {
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "plan");
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  const result = await call(
    { operation: "listOrgs", params: {} },
    { fetchImpl: impl, conversationId: "conv-1" },
  );
  expect(result.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("the Mode pill switching to execute lets the same write through", async () => {
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "plan");
  liveTurns.setMode(ASSISTANT_AGENT, "conv-1", "execute");
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const result = await call(
    {
      operation: "createRoutine",
      params: { agentPath: "w1/Dobby", input: { name: "n" } },
    },
    { fetchImpl: impl, conversationId: "conv-1" },
  );
  expect(result.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("a mode switch in ANOTHER chat does not re-label this turn", async () => {
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "plan");
  liveTurns.setMode(ASSISTANT_AGENT, "conv-other", "execute");
  const result = await call(
    {
      operation: "createRoutine",
      params: { agentPath: "w1/Dobby", input: { name: "n" } },
    },
    { conversationId: "conv-1" },
  );
  expect(result.status).toBe(403);
  expect(result.body).toMatchObject({ code: "plan_mode" });
});

test("plan refuses the approval card too, before the user is ever asked", async () => {
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "plan");
  const result = await call(
    {
      operation: "deleteRoutine",
      params: { agentPath: "w1/Dobby", id: "r1" },
    },
    { path: ASSISTANT_PENDING_PATH, conversationId: "conv-1" },
  );
  expect(result.status).toBe(403);
  expect(result.body).toMatchObject({ code: "plan_mode" });
});

test("an undeclared argument is refused before anything is dispatched", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const result = await call(
    {
      operation: "createRoutine",
      params: {
        agentPath: "w1/Dobby",
        input: { name: "n" },
        "Houston note": "this is reversible",
      },
    },
    { fetchImpl: impl, conversationId: "conv-1" },
  );
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: "invalid_params" });
  expect(String((result.body as { error: string }).error)).toContain(
    "Houston note",
  );
  expect(calls).toEqual([]);
});

test("an undeclared argument never reaches an approval card", async () => {
  const approvals = new ApprovalStore();
  const result = await call(
    {
      operation: "deleteRoutine",
      params: {
        agentPath: "w1/Dobby",
        id: "r1",
        "Houston note": "this is reversible",
      },
    },
    { path: ASSISTANT_PENDING_PATH, conversationId: "conv-1", approvals },
  );
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: "invalid_params" });
  expect(approvals.hasPending(ASSISTANT_AGENT, "conv-1")).toBe(false);
});

test("a write with no live turn behind it is refused", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const result = await call(
    {
      operation: "createRoutine",
      params: { agentPath: "w1/Dobby", input: { name: "n" } },
    },
    { fetchImpl: impl, conversationId: "conv-1", noLiveTurn: true },
  );
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: "not_in_turn" });
  expect(calls).toEqual([]);
});

test("a write naming a chat the host started no turn in is refused", async () => {
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "execute");
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const result = await call(
    {
      operation: "createRoutine",
      params: { agentPath: "w1/Dobby", input: { name: "n" } },
    },
    { fetchImpl: impl, conversationId: "conv-invented", noLiveTurn: true },
  );
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: "not_in_turn" });
  expect(calls).toEqual([]);
});

test("a read outside a turn still reads", async () => {
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  const result = await call(
    { operation: "listOrgs", params: {} },
    { fetchImpl: impl, conversationId: "conv-1", noLiveTurn: true },
  );
  expect(result.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("a local host says members are not supported, not that there are none yet", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const result = await call(
    { operation: "remindOrgMember", params: { member: "Jules" } },
    { fetchImpl: impl, conversationId: "conv-1" },
  );
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: "unsupported_entity" });
  expect(String((result.body as { error: string }).error)).toContain(
    "not supported on this install",
  );
  expect(calls).toEqual([]);
});

test("an operation this deployment cannot perform is refused by name", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { items: [] } }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { fetchImpl: impl, unserved: ["listOrgs"] },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_unavailable_here" });
  expect(JSON.stringify(out.body)).toContain("this app can do");
  expect(calls).toEqual([]);
});

test("the same refusal answers an approval request, not just a call", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  const out = await call(
    { operation: "deleteAgent", params: { id: "a1" } },
    {
      fetchImpl: impl,
      path: ASSISTANT_PENDING_PATH,
      unserved: ["deleteAgent"],
    },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_unavailable_here" });
  expect(calls).toEqual([]);
});

test("a withheld operation still reads as one that does not exist", async () => {
  const out = await call(
    { operation: "rotateEngineSecret", params: {} },
    {
      fetchImpl: fetchStub(() => ({ body: {} })).impl,
      unserved: ["rotateEngineSecret"],
    },
  );
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
});

test("an empty unserved set withholds nothing", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { items: [] } }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("the chat this turn is running in cannot be renamed from inside itself", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await call(
    {
      operation: "conversations.rename",
      params: { agentId: "Work/Ada", id: "conv-1", title: "New" },
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(409);
  expect(out.body).toMatchObject({ code: "protected_conversation" });
  expect(String((out.body as { error: string }).error)).toContain(
    "chat you are talking in",
  );
  expect(calls).toEqual([]);
});

test("deleting the chat this turn runs in is refused before a card is ever raised", async () => {
  const approvals = new ApprovalStore();
  const out = await call(
    {
      operation: "conversations.delete",
      params: { agentId: "Work/Ada", id: "conv-1" },
    },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(409);
  expect(out.body).toMatchObject({ code: "protected_conversation" });
  expect(approvals.hasPending(ASSISTANT_AGENT, "conv-1")).toBe(false);
});

test("any other chat is renamed exactly as before", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await call(
    {
      operation: "conversations.rename",
      params: { agentId: "Work/Ada", id: "conv-2", title: "New" },
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(sent(calls).url).toBe(
    "https://gateway.test/agents/Work%2FAda/conversations/conv-2",
  );
});

test("a mission's transcript belongs to its card, and the refusal says so", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await approvedCall(
    "conversations.delete",
    { agentId: "Work/Ada", id: "activity-m1" },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(409);
  expect(out.body).toMatchObject({ code: "protected_conversation" });
  expect(String((out.body as { error: string }).error)).toContain(
    "deleteActivity",
  );
  expect(calls).toEqual([]);
});

test("a routine's chat belongs to the routine, and the refusal says so", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await call(
    {
      operation: "conversations.rename",
      params: { agentId: "Work/Ada", id: "routine-r1-run-2", title: "New" },
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(409);
  expect(String((out.body as { error: string }).error)).toContain(
    "deleteRoutine",
  );
  expect(calls).toEqual([]);
});

const WELCOME: Activity = {
  id: "m9",
  title: "Welcome",
  description: "",
  status: "done",
  session_key: "welcome-xyz",
};

test("a mission's chat is protected by what the board says, not by its spelling", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await approvedCall(
    "conversations.delete",
    { agentId: "Work/Ada", id: "welcome-xyz" },
    { fetchImpl: impl, activities: [WELCOME] },
  );
  expect(out.status).toBe(409);
  expect(out.body).toMatchObject({ code: "protected_conversation" });
  expect(String((out.body as { error: string }).error)).toContain(
    "deleteActivity",
  );
  expect(calls).toEqual([]);
});

test("a chat no card on the board claims is still the assistant's to delete", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await approvedCall(
    "conversations.delete",
    { agentId: "Work/Ada", id: "conv-2" },
    { fetchImpl: impl, activities: [WELCOME] },
  );
  expect(out.status).toBe(200);
  expect(sent(calls).url).toBe(
    "https://gateway.test/agents/Work%2FAda/conversations/conv-2",
  );
});

test("a differently-cased spelling reaches the same chat, so it is refused too", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  for (const id of ["ACTIVITY-m1", "Routine-r1-run-2"]) {
    const out = await call(
      {
        operation: "conversations.rename",
        params: { agentId: "Work/Ada", id, title: "New" },
      },
      { fetchImpl: impl },
    );
    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({ code: "protected_conversation" });
  }
  const out = await approvedCall(
    "conversations.delete",
    { agentId: "Work/Ada", id: "WELCOME-XYZ" },
    { fetchImpl: impl, activities: [WELCOME] },
  );
  expect(out.status).toBe(409);
  expect(calls).toEqual([]);
});

test("the chat this turn runs in is itself, whatever case it is asked for in", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await call(
    {
      operation: "conversations.rename",
      params: { agentId: "Work/Ada", id: "CONV-1", title: "New" },
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(409);
  expect(String((out.body as { error: string }).error)).toContain(
    "chat you are talking in",
  );
  expect(calls).toEqual([]);
});

test("stopping a mission's turn is still the assistant's to do", async () => {
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const out = await call(
    {
      operation: "turns.cancel",
      params: { agentId: "Work/Ada", conversationId: "activity-m1" },
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(sent(calls).url).toBe(
    "https://gateway.test/agents/Work%2FAda/conversations/activity-m1/cancel",
  );
});

test("reading a protected chat is never refused", async () => {
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  const out = await call(
    {
      operation: "turns.history",
      params: { agentId: "Work/Ada", conversationId: "conv-1" },
    },
    { fetchImpl: impl },
  );
  expect(out.status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("a pre-approved hire the app refused leaves its grant for the retry", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "u1",
    requiresActor: false,
  });
  const hire = async (name: string, status: number) => {
    const params = { name };
    const pending = await call(
      { operation: "createAgent", params },
      { approvals, path: ASSISTANT_PENDING_PATH },
    );
    expect(pending.body).toMatchObject({ preApproved: true });
    const requestId = (pending.body as { requestId: string }).requestId;
    const { impl } = fetchStub(() => ({
      status,
      body: status === 200 ? { ok: true } : { error: "name taken" },
    }));
    return call(
      { operation: "createAgent", params, requestId },
      { approvals, fetchImpl: impl },
    );
  };
  expect((await hire("Marketing Manager", 409)).status).toBe(409);
  expect((await hire("Growth Marketer", 200)).status).toBe(200);
  const third = await call(
    { operation: "createAgent", params: { name: "Designer" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(third.body).not.toHaveProperty("preApproved");
});

test("only the pre-approved call itself can hand its grant back", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "u1",
    requiresActor: false,
  });
  const pending = await call(
    { operation: "createAgent", params: { name: "A" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  const requestId = (pending.body as { requestId: string }).requestId;
  const { impl } = fetchStub(() => ({ status: 404, body: { error: "no" } }));
  await call(
    { operation: "listOrgs", params: {}, requestId },
    { approvals, fetchImpl: impl },
  );
  const next = await call(
    { operation: "createAgent", params: { name: "B" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(next.body).not.toHaveProperty("preApproved");
});

test("a hire the app may have performed never hands its grant back", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "u1",
    requiresActor: false,
  });
  const params = { name: "A" };
  const pending = await call(
    { operation: "createAgent", params },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  const requestId = (pending.body as { requestId: string }).requestId;
  const { impl } = fetchStub(() => ({
    status: 504,
    body: { error: "timeout" },
  }));
  await call(
    { operation: "createAgent", params, requestId },
    { approvals, fetchImpl: impl },
  );
  const next = await call(
    { operation: "createAgent", params: { name: "B" } },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(next.body).not.toHaveProperty("preApproved");
});

test("a pre-approved hire acts only as the person whose grant approved it", async () => {
  const approvals = new ApprovalStore();
  approvals.grants.issue({
    agentId: ASSISTANT_AGENT,
    conversationId: "conv-1",
    operation: "createAgent",
    actor: "person-a-token",
    requiresActor: true,
  });
  liveTurns.start(ASSISTANT_AGENT, "conv-1", "execute", {
    actingAs: "person-a-token",
  });
  const params = { name: "Writer" };
  const pending = await call(
    { operation: "createAgent", params },
    { approvals, path: ASSISTANT_PENDING_PATH },
  );
  expect(pending.body).toMatchObject({ preApproved: true });
  const requestId = (pending.body as { requestId: string }).requestId;
  const { calls, impl } = fetchStub(() => ({ body: { ok: true } }));
  const other = await call(
    { operation: "createAgent", params, requestId },
    { approvals, fetchImpl: impl, actingAs: "person-b-token" },
  );
  expect(other.status).toBe(403);
  expect(calls).toHaveLength(0);
});
