import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { afterEach, expect, test, vi } from "vitest";
import { runWithActingContext } from "../acting-context";
import { makeAssistantCallTool } from "./assistant-call";
import { httpSandboxFetch } from "./sandbox-fetch";

const CTX = {} as ExtensionToolContext;

const catalog: AssistantCatalog = {
  version: 3,
  sourceHash: "fixture",
  operations: [
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
      name: "deleteRoutine",
      group: "routines",
      description: "Delete a routine for good.",
      confirm: true,
      hidden: false,
      params: [{ name: "id", required: true, schema: { type: "string" } }],
      returns: { type: "null" },
      route: {
        method: "DELETE",
        path: "/v1/routines/{id}",
        pathParams: [{ name: "id", encoding: "segment" }],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "rotateSecret",
      group: "internal",
      description: "Withheld entirely.",
      confirm: false,
      hidden: true,
      params: [],
      returns: { type: "null" },
      route: null,
    },
    {
      name: "exportLedger",
      group: "billing",
      description: "No route was derived for this one.",
      confirm: false,
      hidden: false,
      params: [{ name: "id", required: true, schema: { type: "string" } }],
      returns: { type: "null" },
      route: null,
    },
  ],
} as AssistantCatalog;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
});

interface Captured {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetch(
  reply: () => { status?: number; body?: unknown; raw?: string },
) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = reply();
    const payload =
      r.raw ?? (r.body === undefined ? null : JSON.stringify(r.body));
    return new Response(payload, {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const tool = makeAssistantCallTool({
  catalog,
  call: httpSandboxFetch("http://host/", "sb-token"),
});

const run = (params: { operation: string; params: Record<string, unknown> }) =>
  tool.execute("call-1", params, undefined, undefined, CTX);

const text = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.map((c) => c.text ?? "").join("");

const errorCode = (result: { details: unknown }) =>
  (result.details as { error?: { code?: string } }).error?.code;

test("performs a valid operation against the host under the sandbox token", async () => {
  const calls = mockFetch(() => ({ body: [{ id: "r1" }] }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("http://host/sandbox/assistant/call");
  expect(calls[0].method).toBe("POST");
  expect(calls[0].headers.authorization).toBe("Bearer sb-token");
  expect(calls[0].body).toEqual({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(result.details).toEqual({ ok: true, operation: "listRoutines" });
  expect(text(result)).toBe(JSON.stringify([{ id: "r1" }]));
});

test("forwards the turn's acting identity so the gateway authorizes the person", async () => {
  const calls = mockFetch(() => ({ body: [] }));
  await runWithActingContext(
    { actingAs: "acting-token", actingUser: "sub-123" },
    () => run({ operation: "listRoutines", params: { agentPath: "Work/Ada" } }),
  );
  expect(calls[0].headers["x-houston-acting-as"]).toBe("acting-token");
  expect(calls[0].headers["x-houston-acting-user"]).toBe("sub-123");
});

test("outside a turn it attaches no acting headers at all", async () => {
  const calls = mockFetch(() => ({ body: [] }));
  await run({ operation: "listRoutines", params: { agentPath: "Work/Ada" } });
  expect(calls[0].headers["x-houston-acting-as"]).toBeUndefined();
  expect(calls[0].headers["x-houston-acting-user"]).toBeUndefined();
});

test("optional params are omitted rather than sent as undefined", async () => {
  const calls = mockFetch(() => ({ body: [] }));
  await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada", limit: 5 },
  });
  expect(calls[0].body).toEqual({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada", limit: 5 },
  });
});

test.each([
  ["an unknown operation", { operation: "noSuchOp", params: {} }],
  ["a hidden operation", { operation: "rotateSecret", params: {} }],
])("refuses %s before any request leaves the runtime", async (_l, params) => {
  const calls = mockFetch(() => ({ body: {} }));
  const result = await run(params);
  expect(errorCode(result)).toBe("unknown_operation");
  expect(text(result)).toContain("ERROR unknown_operation");
  expect(calls).toHaveLength(0);
});

test.each([
  ["with no arguments at all", {}],
  ["with the arguments it declares", { id: "led-1" }],
])("refuses an operation with no route %s, before any request leaves the runtime", async (_l, params) => {
  const calls = mockFetch(() => ({ body: {} }));
  const result = await run({ operation: "exportLedger", params });
  expect(errorCode(result)).toBe("operation_not_supported");
  expect(text(result)).toContain("not callable in this build");
  expect(calls).toHaveLength(0);
});

test.each([
  ["a missing required param", { agentPath: undefined }, "missing_param"],
  ["a param of the wrong type", { agentPath: 42 }, "invalid_param"],
  [
    "a param the operation does not take",
    { agentPath: "Work/Ada", nope: true },
    "unknown_param",
  ],
])("refuses %s locally, with a correctable code", async (_l, p, code) => {
  const calls = mockFetch(() => ({ body: {} }));
  const result = await run({
    operation: "listRoutines",
    params: p as Record<string, unknown>,
  });
  expect(errorCode(result)).toBe(code);
  expect(calls).toHaveLength(0);
});

test("params that are not an object are refused, not forwarded", async () => {
  const calls = mockFetch(() => ({ body: {} }));
  const result = await run({
    operation: "listRoutines",
    params: ["Work/Ada"] as unknown as Record<string, unknown>,
  });
  expect(errorCode(result)).toBe("invalid_params");
  expect(calls).toHaveLength(0);
});

test("a confirm operation with nobody to ask is refused and forwarded nowhere", async () => {
  const calls = mockFetch(() => ({ body: null }));
  const result = await run({
    operation: "deleteRoutine",
    params: { id: "r1" },
  });
  expect(errorCode(result)).toBe("needs_confirmation");
  expect(text(result)).toMatch(/no one to ask/i);
  expect(calls).toHaveLength(0);
});

test("a host refusal surfaces its named code, never a throw", async () => {
  mockFetch(() => ({
    status: 400,
    body: { code: "operation_not_supported", error: "this host cannot" },
  }));
  const result = await run({
    operation: "listRoutines",
    params: {
      agentPath: "Work/Ada",
    },
  });
  expect(errorCode(result)).toBe("operation_not_supported");
  expect(text(result)).toContain("Tell the user plainly");
});

test("any other gateway status becomes a gateway_error carrying the status", async () => {
  mockFetch(() => ({ status: 403, body: { error: "forbidden" } }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "gateway_error", status: 403 },
  });
  expect(text(result)).toContain("forbidden");
});

test("a compute_busy answer is sent once more and the second answer wins", async () => {
  const replies = [
    {
      status: 503,
      body: {
        error: "engine unavailable",
        code: "compute_busy",
        retryAfterMs: 0,
      },
    },
    { body: [{ id: "r1" }] },
  ];
  const calls = mockFetch(() => replies.shift() ?? { status: 500 });
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(calls).toHaveLength(2);
  expect(result.details).toEqual({ ok: true, operation: "listRoutines" });
});

test("a pod_wake_refused answer is operation_unavailable_here, sent once", async () => {
  const calls = mockFetch(() => ({
    status: 503,
    body: { error: "engine unavailable", code: "pod_wake_refused" },
  }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(calls).toHaveLength(1);
  expect(errorCode(result)).toBe("operation_unavailable_here");
});

test("an unreachable host is a transport_error, not an exception", async () => {
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(errorCode(result)).toBe("transport_error");
  expect(text(result)).toContain("ECONNREFUSED");
});

test("an unreadable 2xx body is a transport_error, not a success", async () => {
  mockFetch(() => ({ raw: "<html>gateway</html>" }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(errorCode(result)).toBe("transport_error");
});

test("an empty 2xx body reads as a null payload", async () => {
  mockFetch(() => ({ raw: "" }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(result.details).toEqual({ ok: true, operation: "listRoutines" });
  expect(text(result)).toBe("null");
});

test("an operation this Houston cannot perform is refused, unsent", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_UNSERVED", "listRoutines");
  const calls = mockFetch(() => ({ body: [] }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(errorCode(result)).toBe("operation_unavailable_here");
  expect(text(result)).toContain("is not available here");
  expect(calls).toHaveLength(0);
});

test("a withheld operation is still indistinguishable from a missing one", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_UNSERVED", "rotateSecret");
  mockFetch(() => ({ body: {} }));
  expect(errorCode(await run({ operation: "rotateSecret", params: {} }))).toBe(
    "unknown_operation",
  );
});

test("no stamp withholds nothing", async () => {
  const calls = mockFetch(() => ({ body: [] }));
  await run({ operation: "listRoutines", params: { agentPath: "Work/Ada" } });
  expect(calls).toHaveLength(1);
});

test("the host's own refusal reaches the model with its sentence intact", async () => {
  mockFetch(() => ({
    status: 400,
    body: {
      error: '"getOrg" is not something this app can do.',
      code: "operation_unavailable_here",
    },
  }));
  const result = await run({
    operation: "listRoutines",
    params: { agentPath: "Work/Ada" },
  });
  expect(errorCode(result)).toBe("operation_unavailable_here");
  expect(text(result)).toContain("is not something this app can do");
});
