import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { expect, test, vi } from "vitest";
import { ApprovalStore } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import type { Agent, Workspace } from "../domain/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import {
  ASSISTANT_CALL_PATH,
  ASSISTANT_PENDING_PATH,
  handleSandboxAssistant,
} from "./assistant-sandbox";

/**
 * The runtime-facing operation dispatcher. What these pin: only a valid sandbox
 * token gets in, an unconfigured deployment says so instead of pretending, an
 * operation the catalog does not publish as callable is refused (fail closed)
 * rather than forwarded, a published one becomes exactly the request the
 * catalog's route describes, and it reaches the gateway carrying the GATEWAY's
 * credential plus the caller's verified acting identity — never the sandbox
 * token.
 *
 * The catalog here is a FIXTURE, never the generated one: these pin the
 * dispatcher, which must not move when the real catalog's operations do.
 */

const CATALOG: AssistantCatalog = {
  version: 3,
  sourceHash: "fixture",
  operations: [
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
        { name: "agentPath", required: true, schema: { type: "string" } },
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
      name: "createRoutine",
      group: "routines",
      description: "Schedule recurring work.",
      confirm: false,
      hidden: false,
      params: [
        { name: "agentPath", required: true, schema: { type: "string" } },
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
        { name: "agentPath", required: true, schema: { type: "string" } },
        { name: "id", required: true, schema: { type: "string" } },
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
        { name: "agentPath", required: true, schema: { type: "string" } },
        { name: "id", required: true, schema: { type: "string" } },
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
      // The client assembles this body from an inline object literal, so the
      // catalog names each key's parameter instead of one whole-body parameter.
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
        { name: "agentId", required: true, schema: { type: "string" } },
        { name: "relPath", required: true, schema: { type: "string" } },
      ],
      returns: { type: "object" },
      // `relPath` is a relative PATH, not a segment: its separators address
      // folders, so they must survive while each segment is escaped on its own.
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
      params: [{ name: "id", required: true, schema: { type: "string" } }],
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

/** The assistant's own sandbox, plus an ordinary agent's — every agent on a
 *  desktop holds one of these, which is exactly why the claim is scoped. */
const ASSISTANT_AGENT = "w1/.assistant";

/**
 * The agents this caller can address. Identifiers are never guessed: every
 * agent-naming parameter is resolved against THIS set before a request is
 * built, so the route's tests need a real one. Ids are written out (rather than
 * generated) so the expected gateway URLs below can name them.
 */
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
  // Dot-named: Houston's own, never addressable and never a match.
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

/** The single request that reached the gateway, or a failure naming its absence. */
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
}

async function call(body: unknown, opts: CallOpts = {}) {
  const out = mockRes();
  const path = opts.path ?? ASSISTANT_CALL_PATH;
  const handled = await handleSandboxAssistant(
    {
      vault,
      store,
      fetchImpl: opts.fetchImpl,
      gatewayFronted: opts.gatewayFronted,
      approvals: opts.approvals ?? new ApprovalStore(),
      assistantGateway: () =>
        opts.gateway === undefined ? GATEWAY : opts.gateway,
      assistantCatalog: () =>
        opts.catalog === undefined ? CATALOG : opts.catalog,
    },
    opts.method ?? "POST",
    path,
    new URL(`http://host${path}`),
    mockReq(body, opts),
    out.res,
  );
  return { handled, ...out.out };
}

/**
 * A `confirm: true` call the user already approved: the store issues the
 * request the card carried, the user's reply decides it, and the call presents
 * the id back — the whole three-step contract, from the outside.
 */
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

// The credential IS the switch: with no gateway configured the route must name
// that state, not fall through to some default destination.
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

// A body with no operation at all must land in the same fail-closed branch as a
// bogus name — never in a lookup that could resolve to an inherited property.
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
  // The runtime's sandbox token must never travel upstream.
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
        id: "r 1/x",
        updates: { cron: "0 9 * * *" },
      },
    },
    { fetchImpl: impl },
  );
  // The id is percent-escaped exactly as HoustonClient.seg escapes it.
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines/r%201%2Fx?agentPath=Work%2FAda",
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

// The client builds these bodies from an inline object literal; a dispatcher
// that read only the whole-parameter form would send them with NO body at all.
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

// `JSON.stringify` drops the undefined properties of the client's own literal,
// so an omitted optional field must be absent here too — never an explicit null.
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
    { agentPath: "Work/Ada", id: "r 1/x" },
    { fetchImpl: impl },
  );
  expect(sent(calls).method).toBe("DELETE");
  expect(sent(calls).url).toBe(
    "https://gateway.test/v1/routines/r%201%2Fx?agentPath=Work%2FAda",
  );
});

// A `path`-encoded parameter carries a relative path: collapsing it into one
// segment would address a file literally named `board/activity one.json`
// instead of that file inside `board`.
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

// Hidden must be indistinguishable from absent: the same refusal as a name that
// was never catalogued, so the hidden set is not a list of things to go find.
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

// A configured gateway with no catalog is a BROKEN image, not an off one: the
// deployment promised operations and packaged nothing to perform them with.
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

// A 2xx that is not JSON means something other than the gateway answered; it
// must not reach the agent as a successful operation.
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

// Where the gateway pair comes from (env / this host / nowhere) is the
// wiring resolver's contract — see assistant-wiring.test.ts.

/**
 * A1 — the claim is AUTHORIZATION, not just authentication.
 *
 * Every agent on a desktop carries a valid sandbox token. Before this, the
 * route only checked that the token verified and then forwarded the operation
 * with the gateway credential, so any agent could post `deleteRoutine` and
 * Houston would perform it, with no card and no trace of who asked.
 */
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

// On a managed pod the gateway hands ONE pod's operation credential to ONE
// agent, so the only claim this host can decode already is that agent's.
test("on a gateway-fronted pod the pod's own agent is the assistant", async () => {
  const { calls, impl } = fetchStub(() => ({ body: [] }));
  const out = await call(
    { operation: "listOrgs", params: {} },
    { token: "sbx-sales", fetchImpl: impl, gatewayFronted: true },
  );
  expect(out.status).toBe(200);
  expect(calls).toHaveLength(1);
});

/**
 * A1 (second half) — the confirmation lock lives HERE, not in the runtime. A
 * runtime that never showed a card, or a caller addressing the route directly
 * with the sandbox token it already holds, performs nothing.
 */
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

/** A4 — single use. One click performs one action, never a second. */
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

/** A2 — the receipt is bound to the exact bytes, not to a card's wording. */
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

/** The `/pending` half: what the card is made of, and what it refuses to raise. */
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

// An unattended turn (a routine) has nobody to ask, so there is nowhere for an
// answer to arrive and nothing may be raised in the first place.
test("a pending request with no conversation is refused", async () => {
  const out = await call(
    { operation: "deleteRoutine", params: { agentPath: "Work/Ada", id: "r1" } },
    { path: ASSISTANT_PENDING_PATH, conversationId: null },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "missing_conversation" });
});

test("a hidden operation cannot be raised for approval either", async () => {
  const out = await call(
    { operation: "rotateEngineSecret", params: {} },
    { path: ASSISTANT_PENDING_PATH },
  );
  expect(out.status).toBe(400);
  expect(out.body).toMatchObject({ code: "operation_not_supported" });
});

/**
 * IDENTIFIERS ARE NEVER GUESSED (the incident this closes: a model asked to act
 * on "Dobby" sent the word "Dobby" into a route that wants an id, got a 404
 * with nothing in it to correct from, and invented another spelling).
 *
 * The route resolves every agent-naming parameter against the agents that
 * actually exist for this caller BEFORE building the request, and a reference
 * that resolves to nothing comes back naming the ones that would have.
 */
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
  // Houston's own dot-agent is not a place work can go, so it is never offered.
  expect(error).not.toContain(".assistant");
  expect(calls).toHaveLength(0);
});

/**
 * The card and the receipt must describe the SAME bytes: an approval raised for
 * the word the user said is spent by the call that runs against the resolved
 * id, and nothing else.
 */
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
  // The card names the agent the way the user will recognize it.
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
