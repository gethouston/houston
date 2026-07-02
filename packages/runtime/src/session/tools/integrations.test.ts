import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import { makeIntegrationTools } from "./integrations";

/**
 * The agent's integration tools are thin proxies to the host's
 * /sandbox/integrations/* under the per-sandbox token. These pin: the right URL
 * + Authorization header, result formatting, and that failures surface (never a
 * silent success) — including the actionable "not connected" (409) case.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  auth?: string;
  headers: Record<string, string>;
  body: unknown;
}
function mockFetch(
  reply: (path: string) => { status?: number; body?: unknown },
) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      auth: headers.authorization,
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = reply(new URL(url).pathname);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const [search, execute] = makeIntegrationTools({
  baseUrl: "https://host.test/",
  sandboxToken: "sb-tok",
});
if (!search || !execute) throw new Error("expected two integration tools");

// pi's tool.execute takes (id, params, signal, onUpdate, ctx); the last two are
// irrelevant to these proxies, so one helper supplies them.
const ctx = {} as unknown as ExtensionContext;
const run = (tool: typeof search, params: unknown) =>
  tool.execute("id", params as never, undefined, undefined, ctx);

test("returns exactly the two generic tools, correctly named", () => {
  expect([search.name, execute.name]).toEqual([
    "integration_search",
    "integration_execute",
  ]);
});

test("search POSTs to the host proxy with the sandbox token + formats matches", async () => {
  const calls = mockFetch((path) =>
    path === "/sandbox/integrations/search"
      ? {
          body: {
            items: [
              {
                action: "GMAIL_SEND_EMAIL",
                toolkit: "gmail",
                description: "Send an email",
                inputParams: { type: "object" },
              },
            ],
          },
        }
      : { status: 404 },
  );
  const out = await run(search, { query: "send an email" });
  expect(calls[0]?.url).toBe("https://host.test/sandbox/integrations/search");
  expect(calls[0]?.auth).toBe("Bearer sb-tok");
  expect(calls[0]?.body).toEqual({ query: "send an email" });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("GMAIL_SEND_EMAIL");
  expect(text).toContain("Send an email");
});

test("execute runs an action and returns its data; a failed action surfaces", async () => {
  mockFetch(() => ({ body: { successful: true, data: { id: "msg1" } } }));
  const out = await run(execute, {
    action: "GMAIL_SEND_EMAIL",
    params: { to: "a@b.com" },
  });
  expect((out.content[0] as { text: string }).text).toContain("msg1");

  mockFetch(() => ({
    body: { successful: false, error: "missing recipient" },
  }));
  await expect(
    run(execute, { action: "GMAIL_SEND_EMAIL", params: {} }),
  ).rejects.toThrow(/did not succeed: missing recipient/);
});

test("a 409 (not connected) becomes an actionable message, not a crash dump", async () => {
  mockFetch(() => ({
    status: 409,
    body: { error: "integration not connected" },
  }));
  await expect(run(execute, { action: "X" })).rejects.toThrow(
    /connect their apps/i,
  );
});

test("C2: attaches the turn's acting-as header inside a turn, and nothing outside one", async () => {
  // Inside a turn that received an acting-as token, the tool forwards it.
  const inTurn = mockFetch(() => ({ body: { items: [] } }));
  await runWithActingContext({ actingAs: "acting-v1.tok" }, () =>
    run(search, { query: "x" }),
  );
  expect(inTurn[0]?.headers["x-houston-acting-as"]).toBe("acting-v1.tok");
  expect(inTurn[0]?.headers["x-houston-acting-user"]).toBeUndefined();

  // A routine turn forwards the acting-user instead.
  const routine = mockFetch(() => ({ body: { successful: true } }));
  await runWithActingContext({ actingUser: "sub-alice" }, () =>
    run(execute, { action: "X" }),
  );
  expect(routine[0]?.headers["x-houston-acting-user"]).toBe("sub-alice");
  expect(routine[0]?.headers["x-houston-acting-as"]).toBeUndefined();

  // A call with NO turn context attaches neither header — today's behavior.
  const bare = mockFetch(() => ({ body: { items: [] } }));
  await run(search, { query: "x" });
  expect(bare[0]?.headers["x-houston-acting-as"]).toBeUndefined();
  expect(bare[0]?.headers["x-houston-acting-user"]).toBeUndefined();
});
