import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import { makeAssistantCallTool } from "./assistant-call";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * `houston_call` is the tool that ACTS. These pin the two things that keep a
 * mis-addressed or unapproved call from ever leaving the runtime — catalog
 * validation and the confirm gate — and, on the happy path, that it carries the
 * sandbox token and the turn's acting identity to the host and nothing else.
 *
 * No failure may throw: the model has to be able to tell a fixable addressing
 * mistake from a refusal it must relay to the user.
 */

const CTX = {} as ExtensionContext;

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
    // Not hidden, but no route was derived for it, so nothing in this build can
    // perform it. Its required param is here to pin that the callability gate
    // runs BEFORE argument validation.
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

const run = (params: {
  operation: string;
  params: Record<string, unknown>;
  confirmed?: boolean;
}) => tool.execute("call-1", params, undefined, undefined, CTX);

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
  // The host, not the runtime, decides the destination — the wire carries the
  // operation NAME and its named arguments, never a URL or a method.
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
  // Hidden must refuse identically to unknown: a distinct message would tell
  // the model the operation exists and is merely being withheld.
  ["a hidden operation", { operation: "rotateSecret", params: {} }],
])("refuses %s before any request leaves the runtime", async (_l, params) => {
  const calls = mockFetch(() => ({ body: {} }));
  const result = await run(params);
  expect(errorCode(result)).toBe("unknown_operation");
  expect(text(result)).toContain("ERROR unknown_operation");
  expect(calls).toHaveLength(0);
});

// The host refuses a routeless operation with the same code, so the runtime
// answering it locally costs a round trip less and names the reason plainly.
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

test("a confirm operation is refused until the user has approved it", async () => {
  const calls = mockFetch(() => ({ body: null }));
  const result = await run({
    operation: "deleteRoutine",
    params: { id: "r1" },
  });
  expect(errorCode(result)).toBe("confirmation_required");
  expect(text(result)).toContain("confirmed true");
  expect(calls).toHaveLength(0);
});

test("confirmed false is not approval either", async () => {
  const calls = mockFetch(() => ({ body: null }));
  const result = await run({
    operation: "deleteRoutine",
    params: { id: "r1" },
    confirmed: false,
  });
  expect(errorCode(result)).toBe("confirmation_required");
  expect(calls).toHaveLength(0);
});

test("a confirm operation goes through once confirmed", async () => {
  const calls = mockFetch(() => ({ body: null }));
  const result = await run({
    operation: "deleteRoutine",
    params: { id: "r1" },
    confirmed: true,
  });
  expect(calls).toHaveLength(1);
  expect(result.details).toEqual({ ok: true, operation: "deleteRoutine" });
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

// A 2xx whose body is not JSON means something other than the host answered
// (a captive portal, a proxy) — it must not read as a successful operation.
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
    operation: "deleteRoutine",
    params: { id: "r1" },
    confirmed: true,
  });
  expect(result.details).toEqual({ ok: true, operation: "deleteRoutine" });
  expect(text(result)).toBe("null");
});
