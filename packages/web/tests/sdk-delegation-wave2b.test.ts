import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * Migration wave 2b — byte-identical route parity for the web-adapter WRITES now
 * delegated to `@houston/sdk`: agent create/rename/delete, activity
 * create/delete, and integration connect/disconnect/session/reconnect-dismiss.
 *
 * Each delegated path MUST issue the exact request the old `controlPlane.*`
 * helper did — same method, path, body, and headers (`Content-Type`,
 * `Authorization` bearer, and the live `x-houston-org`) — over the ONE shared
 * gateway fetch, with NO post-write refetch (a single request). Writes never
 * transient-retry in either path (cpFetch only blind-retries GET/HEAD; the SDK
 * requester never retries), so a single stubbed response is the whole wire.
 *
 * The color overlay (agents) and the setSession 404-swallow (integrations) stay
 * adapter-side and are asserted here alongside the wire.
 */

const BASE = "http://host";
const ORG = "abcdef0123456789"; // [a-f0-9]{16}

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function stubFetch(...responses: Response[]) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = (controlPlane = true) =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane });

// ---- agents ----

test("createAgent delegates a byte-identical single POST /agents (body + headers)", async () => {
  stubFetch(
    json(200, { id: "a1", workspaceId: "w", name: "Ada", createdAt: 0 }),
  );

  const r = await client().createAgent("w", {
    name: "Ada",
    color: "#123456",
    claudeMd: "# hi",
    seeds: { "a.md": "x" },
  });

  expect(calls).toHaveLength(1); // no post-write refetch
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents`);
  expect(post.body).toBe(
    JSON.stringify({ name: "Ada", claudeMd: "# hi", seeds: { "a.md": "x" } }),
  );
  expect(post.headers.get("Content-Type")).toBe("application/json");
  expect(post.headers.get("Authorization")).toBe("Bearer t");
  // The RETURNED wire id drives the color overlay web layers on top.
  expect(r.agent.id).toBe("a1");
  expect(r.agent.color).toBe("#123456");
});

test("createAgent with no seeds posts exactly { name }", async () => {
  stubFetch(
    json(200, { id: "a1", workspaceId: "w", name: "Ada", createdAt: 0 }),
  );
  await client().createAgent("w", { name: "Ada" });
  expect(calls[0].body).toBe(JSON.stringify({ name: "Ada" }));
});

test("createAgent carries the live x-houston-org", async () => {
  stubFetch(
    json(200, { id: "a1", workspaceId: "w", name: "Ada", createdAt: 0 }),
  );
  const c = client();
  c.setActiveOrg(ORG);
  await c.createAgent("w", { name: "Ada" });
  expect(calls[0].headers.get("x-houston-org")).toBe(ORG);
});

test("renameAgent delegates a byte-identical single PATCH /agents/:id", async () => {
  stubFetch(
    json(200, { id: "a1", workspaceId: "w", name: "Neo", createdAt: 0 }),
  );
  await client().renameAgent("w", "a1", "Neo");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("PATCH");
  expect(calls[0].url).toBe(`${BASE}/agents/a1`);
  expect(calls[0].body).toBe(JSON.stringify({ name: "Neo" }));
});

test("deleteAgent delegates a byte-identical single DELETE /agents/:id", async () => {
  stubFetch(json(200, {}));
  await client().deleteAgent("w", "a1");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("DELETE");
  expect(calls[0].url).toBe(`${BASE}/agents/a1`);
  expect(calls[0].body).toBeNull();
});

test("a failed agent create propagates — never swallowed", async () => {
  stubFetch(json(500, { error: "boom" }));
  await expect(client().createAgent("w", { name: "Ada" })).rejects.toThrow();
});

// ---- activities ----

test("createActivity delegates a byte-identical single POST /agents/:id/activities", async () => {
  stubFetch(json(200, { id: "m1", title: "Do", status: "todo" }));
  await client().createActivity("a1", { title: "Do", description: "it" });
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/activities`);
  expect(calls[0].body).toBe(
    JSON.stringify({ title: "Do", description: "it" }),
  );
  expect(calls[0].headers.get("Authorization")).toBe("Bearer t");
});

test("deleteActivity delegates a byte-identical single DELETE", async () => {
  stubFetch(json(200, {}));
  await client().deleteActivity("a1", "m1");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("DELETE");
  expect(calls[0].url).toBe(`${BASE}/agents/a1/activities/m1`);
});

// ---- integrations ----

test("connectIntegration delegates a byte-identical POST /v1/integrations/:provider/connect", async () => {
  stubFetch(json(200, { redirectUrl: "u", connectionId: "c1" }));
  const r = await client().connectIntegration("composio", "gmail", "agent-1");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe(`${BASE}/v1/integrations/composio/connect`);
  expect(calls[0].body).toBe(
    JSON.stringify({ toolkit: "gmail", agent: "agent-1" }),
  );
  expect(r).toEqual({ redirectUrl: "u", connectionId: "c1" });
});

test("connectIntegration omits agent when absent", async () => {
  stubFetch(json(200, { redirectUrl: "u", connectionId: "c1" }));
  await client().connectIntegration("composio", "gmail");
  expect(calls[0].body).toBe(JSON.stringify({ toolkit: "gmail" }));
});

test("disconnectIntegration delegates a byte-identical POST .../disconnect", async () => {
  stubFetch(json(200, {}));
  await client().disconnectIntegration("composio", "gmail");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe(`${BASE}/v1/integrations/composio/disconnect`);
  expect(calls[0].body).toBe(JSON.stringify({ toolkit: "gmail" }));
});

test("setIntegrationSession delegates a byte-identical PUT .../session", async () => {
  stubFetch(json(200, {}));
  await client().setIntegrationSession("tok");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("PUT");
  expect(calls[0].url).toBe(`${BASE}/v1/integrations/session`);
  expect(calls[0].body).toBe(JSON.stringify({ token: "tok" }));
});

test("setIntegrationSession swallows a 404 (deployment with no session sink)", async () => {
  stubFetch(json(404, { error: "no session sink" }));
  await expect(client().setIntegrationSession("tok")).resolves.toBeUndefined();
});

test("setIntegrationSession still surfaces a non-404 failure", async () => {
  stubFetch(json(500, { error: "boom" }));
  await expect(client().setIntegrationSession("tok")).rejects.toThrow();
});

test("dismissIntegrationsReconnectNotice delegates a byte-identical POST", async () => {
  stubFetch(json(200, {}));
  await client().dismissIntegrationsReconnectNotice();
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe(`${BASE}/v1/integrations/reconnect-notice/dismiss`);
});
