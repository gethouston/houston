import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { expect, test, vi } from "vitest";
import type { AssistantCatalog } from "../assistant/catalog";
import type { CredentialVault } from "../ports";
import {
  ASSISTANT_CALL_PATH,
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

const vault: CredentialVault = {
  sandboxToken: () => "sbx",
  validateSandboxToken: (t) =>
    t === "sbx" ? { workspaceId: "w1", agentId: "a1" } : null,
};

const GATEWAY = { url: "https://gateway.test", token: "gw-token" };

function mockReq(
  body: unknown,
  opts: { token?: string; actingAs?: string } = {},
): IncomingMessage {
  const req = Readable.from([
    Buffer.from(body === undefined ? "" : JSON.stringify(body)),
  ]) as unknown as IncomingMessage;
  req.headers = {
    authorization: `Bearer ${opts.token ?? "sbx"}`,
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

async function call(
  body: unknown,
  opts: {
    token?: string;
    actingAs?: string;
    gateway?: typeof GATEWAY | null;
    catalog?: AssistantCatalog | null;
    fetchImpl?: typeof fetch;
    method?: string;
  } = {},
) {
  const out = mockRes();
  const handled = await handleSandboxAssistant(
    {
      vault,
      fetchImpl: opts.fetchImpl,
      assistantGateway: () =>
        opts.gateway === undefined ? GATEWAY : opts.gateway,
      assistantCatalog: () =>
        opts.catalog === undefined ? CATALOG : opts.catalog,
    },
    opts.method ?? "POST",
    ASSISTANT_CALL_PATH,
    new URL(`http://host${ASSISTANT_CALL_PATH}`),
    mockReq(body, opts),
    out.res,
  );
  return { handled, ...out.out };
}

test("a request for another path is not this route's", async () => {
  const out = mockRes();
  await expect(
    handleSandboxAssistant(
      { vault },
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
  await call(
    {
      operation: "addOrgMember",
      params: { email: "ada@example.com", role: "member" },
    },
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
  await call(
    { operation: "addOrgMember", params: { email: "ada@example.com" } },
    { fetchImpl: impl },
  );
  expect(sent(calls).body).toEqual({ email: "ada@example.com" });
});

test("a path placeholder is substituted and percent-escaped", async () => {
  const { calls, impl } = fetchStub(() => ({ body: {} }));
  await call(
    {
      operation: "deleteRoutine",
      params: { agentPath: "Work/Ada", id: "r 1/x" },
    },
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
